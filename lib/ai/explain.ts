// Plain explanations of a decision, written for the person who will read them: the owner,
// a guardian, or the older adult whose payment was paused. Calm and never shaming.

import type { Decision, PaymentRequest } from "@/lib/domain/schemas";
import { formatUsd } from "@/lib/money";
import { askForText, claudeConfigured, ClaudeUnavailableError } from "./claude";

export type Audience = "owner" | "guardian" | "payer";

const SYSTEM = `You write the short message Leash shows or reads aloud after it decides on a payment. Leash is a safety layer that approves, holds or blocks payments made by AI agents and voice assistants.

Write at most two short sentences, in plain words, in the requested language. Be calm and kind; never blame or shame. If money was held or blocked, say clearly that it has not been sent. For a suspected scam, don't accuse anyone: say the request has the signs of a common scam and that a trusted person will check. Output only the message.`;

export async function explainDecision(input: {
  request: PaymentRequest;
  decision: Decision;
  audience: Audience;
  language: string;
  payerName: string;
  guardianName: string | null;
}): Promise<string> {
  const fallback = templateExplanation(input);
  if (!claudeConfigured()) return fallback;

  const prompt = `Language: ${input.language}
Audience: ${input.audience === "payer" ? `${input.payerName}, who asked for the payment` : input.audience === "guardian" ? `${input.guardianName ?? "the guardian"}, who approves risky payments for ${input.payerName}` : `the owner, ${input.payerName}`}
Payment: ${formatUsd(input.request.totalCents)} to ${input.request.payee.name}
Decision: ${input.decision.outcome}
Reasons: ${input.decision.reasons.join(" | ") || "all checks passed"}
${input.decision.hold?.scamSuspected ? "Scam suspected: yes" : ""}
${input.decision.hold?.coolingOffUntil ? `Held until at least: ${input.decision.hold.coolingOffUntil}` : ""}`;

  try {
    return await askForText({ system: SYSTEM, prompt, effort: "low", maxTokens: 2000 });
  } catch (error) {
    if (error instanceof ClaudeUnavailableError) return fallback;
    throw error;
  }
}

/** The explanation used when Claude isn't configured or doesn't answer. */
export function templateExplanation(input: { request: PaymentRequest; decision: Decision; guardianName: string | null }): string {
  const amount = formatUsd(input.request.totalCents);
  const payee = input.request.payee.name;
  switch (input.decision.outcome) {
    case "approve":
      return `Paid ${amount} to ${payee}.`;
    case "block":
      return `I didn't send ${amount} to ${payee}. ${input.decision.reasons[0] ?? ""}`.trim();
    case "hold":
      if (input.decision.hold?.scamSuspected) {
        return `I've paused the ${amount} to ${payee}; nothing has been sent. This request has the signs of a common scam, so ${input.guardianName ?? "a trusted person"} will check it first.`;
      }
      return `The ${amount} to ${payee} is waiting for approval; nothing has been sent yet.`;
  }
}
