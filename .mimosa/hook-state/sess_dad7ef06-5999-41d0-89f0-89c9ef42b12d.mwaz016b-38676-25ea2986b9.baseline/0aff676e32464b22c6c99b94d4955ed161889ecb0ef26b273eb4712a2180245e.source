// The Leash MCP server. Any agent that speaks MCP (Claude, ChatGPT, a custom agent) connects
// with its own bearer token and asks Leash to pay instead of holding PayPal access itself.
//
// Tools:
//   get_spending_status   budget, allowance, tasks and rules, so an agent can plan within them
//   request_payment       ask Leash to pay; returns approve / hold / block with the reasons
//   get_payment_status    follow a held payment until someone approves or declines it

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { PaymentRequestSchema } from "@/lib/domain/schemas";
import { formatUsd } from "@/lib/money";
import { describePolicy } from "@/lib/policy/describe";
import { budgetWindowMs } from "@/lib/policy/evaluate";
import { activeAllowance, findAgentByToken, getAgent, getPayment, listMandates } from "@/lib/payments/queries";
import { submitPayment } from "@/lib/payments/service";

type AuthContext = { http?: { authInfo?: { clientId: string } } };

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const error = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

async function agentFrom(ctx: AuthContext) {
  const agentId = ctx.http?.authInfo?.clientId;
  return agentId ? getAgent(await getDb(), agentId) : null;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_spending_status",
      {
        title: "Get spending status",
        description:
          "Shows what this agent may spend: its rules in plain English, how much of its budget is used, what's left of the owner's PayPal allowance, and the tasks (mandates) it has been given. Call this before shopping.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        const agent = await agentFrom(ctx as AuthContext);
        if (!agent) return error("Unknown agent token.");
        const db = await getDb();
        const now = new Date();
        const allowance = await activeAllowance(db, agent.ownerId, now);
        const mandates = (await listMandates(db, agent.id)).filter((m) => m.status === "active" && m.expiresAt > now);
        return json({
          agent: agent.name,
          rules: describePolicy(agent.policy),
          budget: { limit: formatUsd(agent.policy.budget.limitCents), periodDays: budgetWindowMs(agent.policy.budget.period) / 86_400_000 },
          allowanceRemaining: allowance ? formatUsd(allowance.amountCents - allowance.capturedCents) : "none held",
          tasks: mandates.map((m) => ({
            mandateId: m.id,
            purpose: m.purpose,
            budget: formatUsd(m.maxTotalCents),
            spent: formatUsd(m.spentCents),
            expiresAt: m.expiresAt.toISOString(),
          })),
        });
      },
    );

    server.registerTool(
      "request_payment",
      {
        title: "Request a payment",
        description:
          "Ask Leash to pay a merchant (kind: purchase) or a person (kind: transfer). Amounts are integer US cents. " +
          "Include the mandateId of the task you are doing, every line item, and in `evidence` the exact text you relied on " +
          "(the user's instruction, web pages, emails or messages). Leash answers approve, hold (a person must approve; poll " +
          "get_payment_status) or block. Never retry a blocked payment with different wording.",
        inputSchema: PaymentRequestSchema,
      },
      async (request, ctx) => {
        const agent = await agentFrom(ctx as AuthContext);
        if (!agent) return error("Unknown agent token.");
        const payment = await submitPayment(await getDb(), agent, request);
        return json({
          paymentId: payment.id,
          outcome: payment.outcome,
          status: payment.status,
          explanation: payment.explanation,
          reasons: payment.decision.reasons,
          coolingOffUntil: payment.coolingOffUntil?.toISOString() ?? null,
          payerApprovalUrl: payment.status === "awaiting_payer" ? payment.approveUrl : null,
        });
      },
    );

    server.registerTool(
      "get_payment_status",
      {
        title: "Get payment status",
        description: "Checks a payment this agent requested, e.g. to see whether a held payment was approved or declined.",
        inputSchema: z.object({ paymentId: z.string() }),
      },
      async ({ paymentId }, ctx) => {
        const agent = await agentFrom(ctx as AuthContext);
        if (!agent) return error("Unknown agent token.");
        const payment = await getPayment(await getDb(), paymentId);
        if (!payment || payment.agentId !== agent.id) return error("No such payment for this agent.");
        return json({
          paymentId: payment.id,
          status: payment.status,
          outcome: payment.outcome,
          explanation: payment.explanation,
          failure: payment.failure,
        });
      },
    );
  },
  { serverInfo: { name: "leash", version: "0.1.0" } },
);

/** The MCP endpoint: every request must carry a valid agent token (Authorization: Bearer lsh_...). */
export const mcpHandler = withMcpAuth(
  handler,
  async (_req, token) => {
    if (!token) return undefined;
    const agent = await findAgentByToken(await getDb(), token);
    return agent ? { token, clientId: agent.id, scopes: ["payments"] } : undefined;
  },
  { required: true },
);
