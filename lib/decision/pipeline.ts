// Leash's decision pipeline for one payment request:
//
//   1. Built-in detectors (no model): cash-like items, prompt injection, scam language.
//   2. Claude's review, when configured: item categories, task fit, injection, scam.
//   3. The deterministic policy engine, fed the categories from 1 and 2 (labels only add).
//   4. Every detector check is turned into "pass", "hold" or "block".
//   5. The outcome is the strictest check.
//
// The golden rule: AI can only make a decision stricter. Only the deterministic rules,
// or a person, can approve money.

import type { Review } from "@/lib/ai/review";
import { AiUnavailableError } from "@/lib/ai/openrouter";
import {
  type Approver,
  type Category,
  type Check,
  type Decision,
  type Mandate,
  type Outcome,
  type PaymentRequest,
  stricter,
} from "@/lib/domain/schemas";
import { evaluatePolicy, type PolicyContext } from "@/lib/policy/evaluate";
import { detectInjection, detectScam, labelItems } from "@/lib/risk/heuristics";

export type Reviewer = (request: PaymentRequest, mandate: Mandate | null) => Promise<Review>;

export type DecideInput = {
  request: PaymentRequest;
  /** Facts from the database; the item labels are worked out here. */
  context: Omit<PolicyContext, "itemLabels">;
  /** Claude's reviewer, or null when Claude isn't configured. */
  reviewer: Reviewer | null;
  /** Whether the agent's owner has a guardian who can approve risky payments. */
  hasGuardian: boolean;
};

export type DecideResult = Decision & { review: Review | null };

export async function decide({ request, context, reviewer, hasGuardian }: DecideInput): Promise<DecideResult> {
  // 1. Built-in detectors.
  const heuristicLabels = labelItems(request);
  const injection = detectInjection(request);
  const scam = detectScam(request);

  // 2. Claude's review.
  let review: Review | null = null;
  let reviewError: string | null = null;
  if (reviewer) {
    try {
      review = await reviewer(request, context.mandate);
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      reviewError = error.message;
    }
  }

  // 3. Policy engine, with the labels both detectors found.
  const itemLabels: Category[][] = request.items.map((_, index) => {
    const labels = new Set<Category>(heuristicLabels[index] ?? []);
    for (const category of review?.items.find((i) => i.index === index)?.categories ?? []) labels.add(category);
    return [...labels];
  });
  const policyResult = evaluatePolicy(request, { ...context, itemLabels });

  // 4. Detector checks.
  const checks: Check[] = [...policyResult.checks];

  checks.push(
    injection.severity === "none"
      ? heuristic("heuristic_injection", "No hidden instructions", "pass", "No instructions aimed at AI agents found in what the agent read.")
      : {
          ...heuristic(
            "heuristic_injection",
            "No hidden instructions",
            injection.severity === "high" ? "block" : injection.severity === "medium" ? "hold" : "info",
            `What the agent read ${injection.signals.join("; ")}.`,
            injection.quotes,
          ),
          headline: "A page the agent read had hidden instructions telling AI agents what to buy.",
        },
  );

  checks.push(
    scam.severity === "none"
      ? heuristic("heuristic_scam", "No scam signs", "pass", "No common scam language found.")
      : {
          ...heuristic(
            "heuristic_scam",
            "No scam signs",
            scam.severity === "low" ? "info" : "hold",
            `Signs of a scam: ${scam.signals.map((s) => s.label).join(", ")}.`,
            scam.signals.map((s) => s.quote),
          ),
          headline: "This request has the signs of a common scam.",
        },
  );

  if (review) {
    checks.push(...reviewChecks(review, context, request));
  } else {
    checks.push(
      reviewError
        ? ai("ai_review", "AI review", "hold", `The AI couldn't review this payment (${reviewError}), so a person will check it.`)
        : ai("ai_review", "AI review", "skipped", "The AI isn't configured; the rules and built-in detectors decided."),
    );
  }

  // 5. Strictest wins.
  const outcome = checks.reduce<Outcome>(
    (acc, c) => (c.status === "block" ? stricter(acc, "block") : c.status === "hold" ? stricter(acc, "hold") : acc),
    "approve",
  );

  const scamSuspected = checks.some((c) => ["heuristic_scam", "ai_scam", "payee_changed"].includes(c.id) && c.status === "hold");
  // Reasons lead with what matters most: someone steering the agent, then scams, then the rest.
  const byPriority = (status: Check["status"]) =>
    checks
      .filter((c) => c.status === status)
      .sort((a, b) => (REASON_PRIORITY[a.id] ?? 9) - (REASON_PRIORITY[b.id] ?? 9))
      .map((c) => c.headline ?? c.detail);
  const reasons = [...byPriority("block"), ...byPriority("hold")];

  let hold: Decision["hold"] = null;
  if (outcome === "hold") {
    const policyApprover = context.policy.approval.approver;
    // Someone being scammed can't be the one to confirm it: a suspected scam goes to the guardian.
    const approver: Approver = scamSuspected && hasGuardian ? "guardian" : !hasGuardian ? "owner" : policyApprover;
    const minutes = context.policy.approval.coolingOffMinutes;
    hold = {
      approver,
      scamSuspected,
      coolingOffUntil: scamSuspected && minutes > 0 ? new Date(context.now.getTime() + minutes * 60_000).toISOString() : null,
    };
  }

  return { outcome, checks, reasons: [...new Set(reasons)], hold, review };
}

function reviewChecks(review: Review, context: DecideInput["context"], request: PaymentRequest): Check[] {
  const checks: Check[] = [];

  // The reviewer may hallucinate items that don't exist (models sometimes label a transfer as
  // "item 1"); an item that isn't in the request can't label anything. Transfers have none.
  const realItems = review.items.filter((i) => Number.isInteger(i.index) && i.index >= 0 && i.index < request.items.length);
  const labelled = realItems.filter((i) => i.categories.length > 0);
  checks.push(
    ai(
      "ai_items",
      "What's being bought",
      request.kind === "purchase" ? "info" : "skipped",
      request.kind === "purchase"
        ? labelled.map((i) => `${request.items[i.index]?.name ?? `Item ${i.index + 1}`}: ${i.categories.join(", ")}${i.note ? ` (${i.note})` : ""}`).join("; ") ||
            "No categories found."
        : "Transfers have no items.",
    ),
  );

  const cashLike = realItems.filter((i) => i.cashEquivalent);
  if (cashLike.length > 0) {
    const names = cashLike.map((i) => request.items[i.index]?.name ?? `item ${i.index + 1}`).join(", ");
    checks.push(
      ai(
        "ai_cash_equivalent",
        "Nothing that works like cash",
        context.policy.blockCashEquivalents ? "block" : "info",
        `${names} work${cashLike.length > 1 ? "" : "s"} like cash.`,
      ),
    );
  }

  const fit = review.mandateAlignment;
  checks.push(
    ai(
      "ai_mandate",
      "Serves the owner's task",
      fit.verdict === "misaligned" ? "hold" : fit.verdict === "aligned" ? "pass" : fit.verdict === "unclear" ? "info" : "skipped",
      fit.reason,
    ),
  );

  const inj = review.injection;
  checks.push({
    ...ai("ai_injection", "Not steered by someone else", inj.detected ? (inj.confidence === "low" ? "hold" : "block") : "pass", inj.explanation, inj.quotes),
    ...(inj.detected ? { headline: "Someone other than the owner steered the agent toward this payment." } : {}),
  });

  const scam = review.scam;
  const scamFlagged = scam.risk === "high" || scam.risk === "medium";
  checks.push({
    ...ai(
      "ai_scam",
      "Doesn't look like a scam",
      scamFlagged ? "hold" : scam.risk === "low" ? "info" : "pass",
      scam.scamType ? `${scam.scamType}: ${scam.explanation}` : scam.explanation,
      scam.signals.map((s) => s.quote),
    ),
    ...(scamFlagged ? { headline: `This request has the signs of a ${scam.scamType ?? "common scam"}.` } : {}),
  });
  return checks;
}

const REASON_PRIORITY: Record<string, number> = {
  heuristic_injection: 0,
  ai_injection: 0,
  payee_changed: 1,
  heuristic_scam: 1,
  ai_scam: 1,
  categories: 2,
  ai_cash_equivalent: 2,
  mandate: 3,
  ai_mandate: 3,
};

function heuristic(id: string, label: string, status: Check["status"], detail: string, quotes?: string[]): Check {
  return { id, label, source: "heuristic", status, detail, ...(quotes && quotes.length > 0 ? { quotes } : {}) };
}

function ai(id: string, label: string, status: Check["status"], detail: string, quotes?: string[]): Check {
  return { id, label, source: "ai", status, detail, ...(quotes && quotes.length > 0 ? { quotes } : {}) };
}
