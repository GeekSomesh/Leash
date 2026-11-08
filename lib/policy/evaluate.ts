// The deterministic rules engine. Given a payment request, the agent's policy and a few
// facts from the database, it decides approve / hold / block and explains every check.
//
// This is the only code that can approve money. AI checks run afterwards and can only
// make the outcome stricter (see lib/decision/pipeline.ts).

import {
  CASH_EQUIVALENTS,
  CATEGORY_LABELS,
  type Category,
  type Check,
  type Mandate,
  type Outcome,
  type PaymentRequest,
  type Policy,
  stricter,
} from "@/lib/domain/schemas";
import { formatUsd } from "@/lib/money";

export type PolicyContext = {
  now: Date;
  policy: Policy;
  /** The mandate named by request.mandateId, or null if the request names none or it doesn't exist. */
  mandate: Mandate | null;
  /** What this agent already spent (approved or captured) inside the policy's budget window. */
  spentInPeriodCents: number;
  /** Payments this agent made or attempted (approved or held) inside the velocity window. */
  paymentsInVelocityWindow: number;
  /** Whether the owner has paid this payee before. */
  payeeKnown: boolean;
  /**
   * When this payee is new but the owner has paid someone with the same name before, that
   * other account (e.g. the real Arjun's PayPal). A familiar name on a new account is how
   * impersonation scams work.
   */
  samePayeeNameKnownAs: string | null;
  /** Remaining PayPal-held allowance that purchases capture from; null when none is active. */
  allowanceRemainingCents: number | null;
  /**
   * Extra categories per line item from the classifiers (Claude or the heuristics). They are
   * added to the item's declared category and can never remove it, so a classifier can make a
   * purchase look riskier but never safer.
   */
  itemLabels: Category[][];
};

export type PolicyResult = {
  outcome: Outcome;
  checks: Check[];
};

const BUDGET_PERIOD_TEXT: Record<Policy["budget"]["period"], string> = {
  day: "24 hours",
  week: "7 days",
  month: "30 days",
};

export function budgetWindowMs(period: Policy["budget"]["period"]): number {
  const hour = 60 * 60 * 1000;
  return { day: 24 * hour, week: 7 * 24 * hour, month: 30 * 24 * hour }[period];
}

const labels = (categories: Iterable<Category>) => [...new Set(categories)].map((c) => CATEGORY_LABELS[c]).join(", ");

const sameMerchant = (payee: PaymentRequest["payee"], entry: string) => {
  const needle = entry.trim().toLowerCase();
  return payee.id.toLowerCase() === needle || payee.name.trim().toLowerCase() === needle;
};

/**
 * Categories that apply to each line item: its declared category plus the classifiers' labels,
 * falling back to what the merchant declares about itself, then to "other".
 */
export function effectiveItemCategories(request: PaymentRequest, itemLabels: Category[][]): Category[][] {
  return request.items.map((item, index) => {
    const found = new Set<Category>(itemLabels[index] ?? []);
    if (item.declaredCategory) found.add(item.declaredCategory);
    if (found.size > 0) return [...found];
    return request.payee.declaredCategories.length > 0 ? [...request.payee.declaredCategories] : ["other"];
  });
}

export function evaluatePolicy(request: PaymentRequest, ctx: PolicyContext): PolicyResult {
  const { policy } = ctx;
  const checks: Check[] = [];
  const isPurchase = request.kind === "purchase";
  const total = request.totalCents;
  const categoriesByItem = isPurchase ? effectiveItemCategories(request, ctx.itemLabels) : [];
  const allCategories = new Set(categoriesByItem.flat());

  // 1. The amounts must add up, so an agent can't describe one thing and charge another.
  {
    const itemsTotal = request.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const expected = itemsTotal + request.shippingCents + request.taxCents;
    if (total <= 0) {
      checks.push(check("totals", "Amounts add up", "block", "The payment is for $0.00."));
    } else if (isPurchase && request.items.length === 0) {
      checks.push(check("totals", "Amounts add up", "block", "A purchase must list what is being bought."));
    } else if (request.items.length > 0 && expected !== total) {
      checks.push(
        check(
          "totals",
          "Amounts add up",
          "block",
          `Items, shipping and tax come to ${formatUsd(expected)}, but the agent asked to pay ${formatUsd(total)}.`,
        ),
      );
    } else {
      checks.push(check("totals", "Amounts add up", "pass", `${formatUsd(total)} in total.`));
    }
  }

  // 2. Purchases belong to a task (mandate) the owner gave the agent.
  if (isPurchase) checks.push(mandateCheck(request, ctx, categoriesByItem));
  else checks.push(check("mandate", "Fits the task it was given", "skipped", "Transfers to people are not tied to a task."));

  // 3. Rolling budget.
  {
    const after = ctx.spentInPeriodCents + total;
    const window = BUDGET_PERIOD_TEXT[policy.budget.period];
    checks.push(
      after > policy.budget.limitCents
        ? check(
            "budget",
            "Within budget",
            "block",
            `${formatUsd(ctx.spentInPeriodCents)} spent in the last ${window}; this would make ${formatUsd(after)}, over the ${formatUsd(policy.budget.limitCents)} limit.`,
          )
        : check(
            "budget",
            "Within budget",
            "pass",
            `${formatUsd(after)} of ${formatUsd(policy.budget.limitCents)} used in the last ${window}.`,
          ),
    );
  }

  // 4. Purchases are paid from the allowance the owner authorized in PayPal.
  if (isPurchase) {
    if (ctx.allowanceRemainingCents === null) {
      checks.push(
        check("allowance", "Covered by the PayPal allowance", "block", "No allowance is held in PayPal yet. The owner needs to approve one first."),
      );
    } else if (total > ctx.allowanceRemainingCents) {
      checks.push(
        check(
          "allowance",
          "Covered by the PayPal allowance",
          "block",
          `Only ${formatUsd(ctx.allowanceRemainingCents)} of the held allowance is left.`,
        ),
      );
    } else {
      checks.push(
        check("allowance", "Covered by the PayPal allowance", "pass", `${formatUsd(ctx.allowanceRemainingCents)} of the allowance is available.`),
      );
    }
  } else {
    checks.push(check("allowance", "Covered by the PayPal allowance", "skipped", "Transfers are held in PayPal one at a time."));
  }

  // 5. Per-payment limits.
  if (total > policy.perPayment.maxCents) {
    checks.push(check("per_payment", "Within per-payment limits", "block", `Over the ${formatUsd(policy.perPayment.maxCents)} limit for one payment.`));
  } else if (policy.perPayment.askAboveCents !== null && total > policy.perPayment.askAboveCents) {
    checks.push(
      check("per_payment", "Within per-payment limits", "hold", `Over ${formatUsd(policy.perPayment.askAboveCents)}, so a person has to approve it.`),
    );
  } else {
    checks.push(check("per_payment", "Within per-payment limits", "pass", `Under the ${formatUsd(policy.perPayment.maxCents)} limit.`));
  }

  // 6. Categories (purchases only; transfers have their own rule below).
  if (isPurchase) checks.push(categoryCheck(policy, allCategories));
  else checks.push(check("categories", "Allowed categories", "skipped", "Transfers are covered by the transfer rule."));

  // 7. Merchant lists.
  if (policy.merchants.blocked.some((entry) => sameMerchant(request.payee, entry))) {
    checks.push(check("merchant", "Allowed payee", "block", `${request.payee.name} is on the blocked list.`));
  } else if (policy.merchants.allowedOnly && !policy.merchants.allowedOnly.some((entry) => sameMerchant(request.payee, entry))) {
    checks.push(check("merchant", "Allowed payee", "hold", `${request.payee.name} is not on the list of approved merchants.`));
  } else {
    checks.push(check("merchant", "Allowed payee", "pass", `${request.payee.name} is allowed.`));
  }

  // 8. First payment to someone new.
  if (ctx.payeeKnown) {
    checks.push(check("new_payee", "Known payee", "pass", `Paid ${request.payee.name} before.`));
  } else {
    const status = ({ allow: "pass", ask: "hold", block: "block" } as const)[policy.newPayee.action];
    const detail =
      status === "pass"
        ? `First payment to ${request.payee.name}; new payees are allowed.`
        : `First payment to ${request.payee.name}${request.payee.paypalEmail ? ` (${request.payee.paypalEmail})` : ""}.`;
    checks.push(check("new_payee", "Known payee", status, detail));
    if (ctx.samePayeeNameKnownAs) {
      checks.push(
        check(
          "payee_changed",
          "Same person, same account",
          "hold",
          `${request.payee.name} has been paid before, but at a different account (${ctx.samePayeeNameKnownAs}). A familiar name on a new account is a common sign of impersonation.`,
        ),
      );
    }
  }

  // 9. Sending money to people.
  if (request.kind === "transfer") {
    if (!policy.transfers.enabled) {
      checks.push(check("transfer", "Transfers allowed", "block", "This assistant isn't allowed to send money to people."));
    } else if (policy.transfers.askAboveCents !== null && total > policy.transfers.askAboveCents) {
      checks.push(
        check("transfer", "Transfers allowed", "hold", `Transfers over ${formatUsd(policy.transfers.askAboveCents)} need approval.`),
      );
    } else {
      checks.push(check("transfer", "Transfers allowed", "pass", "Transfers are allowed at this amount."));
    }
  }

  // 10. Pace of spending.
  if (policy.velocity) {
    const count = ctx.paymentsInVelocityWindow + 1;
    checks.push(
      count > policy.velocity.maxPayments
        ? check(
            "velocity",
            "Normal pace of spending",
            "hold",
            `${count} payments in ${policy.velocity.windowMinutes} minutes; the limit is ${policy.velocity.maxPayments}.`,
          )
        : check("velocity", "Normal pace of spending", "pass", `${count} of ${policy.velocity.maxPayments} payments in ${policy.velocity.windowMinutes} minutes.`),
    );
  }

  // 11. Quiet hours.
  if (policy.quietHours) {
    const { startHour, endHour, timezone } = policy.quietHours;
    const hour = localHour(ctx.now, timezone);
    const quiet = startHour < endHour ? hour >= startHour && hour < endHour : startHour > endHour && (hour >= startHour || hour < endHour);
    checks.push(
      quiet
        ? check("quiet_hours", "Outside quiet hours", "hold", `It's ${pad(hour)}:00 in ${timezone}, inside quiet hours (${pad(startHour)}:00 to ${pad(endHour)}:00).`)
        : check("quiet_hours", "Outside quiet hours", "pass", `Outside quiet hours (${pad(startHour)}:00 to ${pad(endHour)}:00).`),
    );
  }

  const outcome = checks.reduce<Outcome>(
    (acc, c) => (c.status === "block" ? stricter(acc, "block") : c.status === "hold" ? stricter(acc, "hold") : acc),
    "approve",
  );
  return { outcome, checks };
}

function mandateCheck(request: PaymentRequest, ctx: PolicyContext, categoriesByItem: Category[][]): Check {
  const label = "Fits the task it was given";
  const { mandate, policy, now } = ctx;
  if (!request.mandateId) {
    return policy.requireMandate
      ? check("mandate", label, "hold", "The agent wasn't given a task for this purchase, so the owner has to approve it.")
      : check("mandate", label, "skipped", "No task given; this policy doesn't require one.");
  }
  if (!mandate) return check("mandate", label, "block", `The agent cited task ${request.mandateId}, which doesn't exist for this agent.`);
  if (mandate.status !== "active") return check("mandate", label, "block", `The task "${mandate.purpose}" is ${mandate.status}.`);
  if (Date.parse(mandate.expiresAt) <= now.getTime()) return check("mandate", label, "block", `The task "${mandate.purpose}" has expired.`);

  const after = mandate.spentCents + request.totalCents;
  if (after > mandate.maxTotalCents) {
    return check(
      "mandate",
      label,
      "block",
      `The task "${mandate.purpose}" allows ${formatUsd(mandate.maxTotalCents)}; ${formatUsd(mandate.spentCents)} is already spent, so ${formatUsd(request.totalCents)} more is too much.`,
    );
  }
  if (mandate.merchants && !mandate.merchants.some((entry) => sameMerchant(request.payee, entry))) {
    return check("mandate", label, "hold", `The task "${mandate.purpose}" doesn't include buying from ${request.payee.name}.`);
  }
  if (mandate.categories) {
    const allowed = new Set(mandate.categories);
    const outside = categoriesByItem.flat().filter((c) => !allowed.has(c));
    if (outside.length > 0) {
      return check("mandate", label, "hold", `The task "${mandate.purpose}" doesn't cover ${labels(outside)}.`);
    }
  }
  return check("mandate", label, "pass", `Part of "${mandate.purpose}" (${formatUsd(after)} of ${formatUsd(mandate.maxTotalCents)}).`);
}

function categoryCheck(policy: Policy, categories: Set<Category>): Check {
  const label = "Allowed categories";
  const found = [...categories];
  const blocked = found.filter((c) => policy.categories.blocked.includes(c));
  if (blocked.length > 0) return check("categories", label, "block", `Never allowed: ${labels(blocked)}.`);

  const cashLike = found.filter((c) => CASH_EQUIVALENTS.includes(c));
  if (policy.blockCashEquivalents && cashLike.length > 0) {
    return check("categories", label, "block", `Blocked because it works like cash: ${labels(cashLike)}.`);
  }

  const ask = found.filter((c) => policy.categories.askFor.includes(c));
  if (ask.length > 0) return check("categories", label, "hold", `Always needs approval: ${labels(ask)}.`);

  if (policy.categories.allowedOnly) {
    const allowed = new Set(policy.categories.allowedOnly);
    const outside = found.filter((c) => !allowed.has(c));
    if (outside.length > 0) return check("categories", label, "hold", `Outside the usual categories: ${labels(outside)}.`);
  }
  return check("categories", label, "pass", found.length > 0 ? `${capitalize(labels(found))}.` : "No category found.");
}

function check(id: string, label: string, status: Check["status"], detail: string): Check {
  return { id, label, source: "rule", status, detail };
}

function localHour(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now);
  return Number(hour) % 24;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
