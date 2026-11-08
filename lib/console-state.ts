// Everything the Leash console shows, in one snapshot the browser polls.

import { claudeConfigured } from "@/lib/ai/claude";
import { databaseKind, type Db } from "@/lib/db/client";
import { DEMO_IDS, resetDemo } from "@/lib/demo/seed";
import type { Check, Decision, PaymentRequest } from "@/lib/domain/schemas";
import { paypalConfigured } from "@/lib/paypal/client";
import { describePolicy } from "@/lib/policy/describe";
import { allowedApprovers } from "@/lib/payments/service";
import {
  activityItem,
  getPerson,
  ledgerFor,
  listAgents,
  listAllowances,
  listMandates,
  recentActivity,
  type ActivityItem,
} from "@/lib/payments/queries";

export type LedgerView = { type: string; amountCents: number; paypalId: string | null; status: string; simulated: boolean; detail: string | null };

export type PaymentView = {
  id: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  agentKind: string;
  ownerName: string;
  kind: "purchase" | "transfer";
  payeeName: string;
  totalCents: number;
  outcome: Decision["outcome"];
  status: string;
  explanation: string | null;
  reasons: string[];
  checks: Check[];
  hold: Decision["hold"];
  coolingOffUntil: string | null;
  approvers: { id: string; name: string }[];
  simulated: boolean;
  failure: string | null;
  approveUrl: string | null;
  request: PaymentRequest;
  ledger: LedgerView[];
};

export type ConsoleState = {
  mode: {
    paypal: "sandbox" | "simulated";
    claude: boolean;
    database: "postgres" | "pglite";
    /** Sandbox payee emails for Payouts (DEMO_* variables). Missing emails mean payouts are skipped. */
    payoutEmails: { merchants: boolean; people: boolean };
  };
  payments: PaymentView[];
  allowances: {
    id: string;
    amountCents: number;
    capturedCents: number;
    status: string;
    simulated: boolean;
    approveUrl: string | null;
    periodEnd: string;
  }[];
  agents: {
    id: string;
    name: string;
    kind: string;
    ownerName: string;
    rules: string[];
    policySource: string;
    mandates: { id: string; purpose: string; maxTotalCents: number; spentCents: number; status: string; expiresAt: string }[];
  }[];
};

export async function getConsoleState(db: Db): Promise<ConsoleState> {
  let agentRows = await listAgents(db);
  if (agentRows.length === 0) {
    // First run: load the demo world so the console is never empty.
    await resetDemo(db);
    agentRows = await listAgents(db);
  }

  const payments: PaymentView[] = [];
  for (const item of await recentActivity(db, 30)) payments.push(await toPaymentView(db, item));

  const mandates = await listMandates(db);
  return {
    mode: {
      paypal: paypalConfigured() ? "sandbox" : "simulated",
      claude: claudeConfigured(),
      database: databaseKind(),
      payoutEmails: {
        merchants: Boolean(process.env.DEMO_MERCHANT_FRESHCART_EMAIL && process.env.DEMO_MERCHANT_ORBITTOYS_EMAIL),
        people: Boolean(process.env.DEMO_PERSON_ARJUN_EMAIL),
      },
    },
    payments,
    allowances: (await listAllowances(db)).map((a) => ({
      id: a.id,
      amountCents: a.amountCents,
      capturedCents: a.capturedCents,
      status: a.status,
      simulated: a.simulated,
      approveUrl: a.status === "awaiting_approval" ? a.approveUrl : null,
      periodEnd: a.periodEnd.toISOString(),
    })),
    agents: agentRows.map(({ agent, ownerName }) => ({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      ownerName,
      rules: describePolicy(agent.policy),
      policySource: agent.policySource,
      mandates: mandates
        .filter((m) => m.agentId === agent.id)
        .map((m) => ({
          id: m.id,
          purpose: m.purpose,
          maxTotalCents: m.maxTotalCents,
          spentCents: m.spentCents,
          status: m.status,
          expiresAt: m.expiresAt.toISOString(),
        })),
    })),
  };
}

export async function getPaymentView(db: Db, id: string): Promise<PaymentView | null> {
  const item = await activityItem(db, id);
  return item ? toPaymentView(db, item) : null;
}

async function toPaymentView(db: Db, p: ActivityItem): Promise<PaymentView> {
  const approverIds = p.status === "held" ? await allowedApprovers(db, p) : [];
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    agentId: p.agentId,
    agentName: p.agentName,
    agentKind: p.agentKind,
    ownerName: p.ownerName,
    kind: p.kind,
    payeeName: p.payeeName,
    totalCents: p.totalCents,
    outcome: p.outcome,
    status: p.status,
    explanation: p.explanation,
    reasons: p.decision.reasons,
    checks: p.decision.checks,
    hold: p.decision.hold,
    coolingOffUntil: p.coolingOffUntil?.toISOString() ?? null,
    approvers: await Promise.all(approverIds.map(async (id) => ({ id, name: (await getPerson(db, id))?.name ?? id }))),
    simulated: p.simulated,
    failure: p.failure,
    approveUrl: p.status === "awaiting_payer" ? p.approveUrl : null,
    request: p.request,
    ledger: (await ledgerFor(db, p.id)).map((e) => ({
      type: e.type,
      amountCents: e.amountCents,
      paypalId: e.paypalId,
      status: e.status,
      simulated: e.simulated,
      detail: e.detail,
    })),
  };
}

/** In the demo, the console acts as Priya (the account owner and Ramesh's guardian). */
export const CONSOLE_USER_ID = DEMO_IDS.priya;
