// Turns an owner's plain-English rules into Leash's JSON policy with structured outputs.
// The owner then confirms the policy by reading describePolicy(policy), which code
// generates from the JSON, so what they approve is exactly what will be enforced.

import { z } from "zod";
import { PolicySchema, type Policy } from "@/lib/domain/schemas";
import { describePolicy } from "@/lib/policy/describe";
import { askForJson } from "./openrouter";

const CompiledSchema = z.object({
  policy: PolicySchema,
  questions: z.array(z.string()).describe("Short questions about anything ambiguous, answered with the safer choice for now"),
});

const SYSTEM = `You turn a person's plain-English spending rules for one AI agent into Leash's JSON policy.

- Amounts are US cents: $150 is 15000.
- "A week" means the rolling budget period "week"; "a month" means "month".
- Fill in every field. Where the rules say nothing, use these safe defaults:
  - perPayment.maxCents: the budget limit; perPayment.askAboveCents: null
  - categories: blocked [], askFor [], allowedOnly null, unless the rules restrict categories ("groceries only" means allowedOnly [groceries, household])
  - blockCashEquivalents: true
  - merchants: blocked [], allowedOnly null
  - newPayee.action: "ask"
  - transfers.enabled: false, unless the rules allow sending money to people
  - velocity: null; quietHours: null
  - requireMandate: true for shopping agents; false for an assistant that pays people or bills when asked
  - approval.approver: "owner", unless the rules name the guardian as the approver; approval.coolingOffMinutes: 10
- When the rules are ambiguous, choose the safer reading and add a short question to "questions".
- Never grant a permission the rules don't give.`;

export type CompiledPolicy = { policy: Policy; plainEnglish: string[]; questions: string[] };

export async function compilePolicy(input: {
  rules: string;
  agentName: string;
  ownerName: string;
  guardianName: string | null;
}): Promise<CompiledPolicy> {
  const prompt = `Agent: ${input.agentName}
Owner (the person the agent works for): ${input.ownerName}
Guardian (approves risky payments for the owner): ${input.guardianName ?? "none"}

<rules>
${input.rules}
</rules>`;

  const { policy, questions } = await askForJson({ schema: CompiledSchema, system: SYSTEM, prompt, effort: "medium" });
  return { policy, plainEnglish: describePolicy(policy), questions };
}
