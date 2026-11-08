// Read-side queries: the facts the policy engine needs, and what the UI shows.

import { and, desc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agents, allowances, guardianships, knownPayees, ledger, mandates, paymentRequests, people } from "@/lib/db/schema";
import type { Mandate, PaymentRequest } from "@/lib/domain/schemas";
import { budgetWindowMs, type PolicyContext } from "@/lib/policy/evaluate";
import { hashToken } from "./ids";

export type AgentRow = typeof agents.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type AllowanceRow = typeof allowances.$inferSelect;
export type PaymentRow = typeof paymentRequests.$inferSelect;
export type MandateRow = typeof mandates.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;

export async function getAgent(db: Db, id: string): Promise<AgentRow | null> {
  const [row] = await db.select().from(agents).where(eq(agents.id, id));
  return row ?? null;
}

export async function findAgentByToken(db: Db, token: string): Promise<AgentRow | null> {
  const [row] = await db.select().from(agents).where(eq(agents.tokenHash, hashToken(token)));
  return row ?? null;
}

export async function getPerson(db: Db, id: string): Promise<PersonRow | null> {
  const [row] = await db.select().from(people).where(eq(people.id, id));
  return row ?? null;
}

export async function guardianFor(db: Db, personId: string): Promise<PersonRow | null> {
  const [row] = await db
    .select({ person: people })
    .from(guardianships)
    .innerJoin(people, eq(people.id, guardianships.guardianId))
    .where(eq(guardianships.personId, personId));
  return row?.person ?? null;
}

export async function getPayment(db: Db, id: string): Promise<PaymentRow | null> {
  const [row] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id));
  return row ?? null;
}

export async function activeAllowance(db: Db, ownerId: string, now: Date): Promise<AllowanceRow | null> {
  const [row] = await db
    .select()
    .from(allowances)
    .where(and(eq(allowances.ownerId, ownerId), eq(allowances.status, "active"), gt(allowances.periodEnd, now)))
    .orderBy(desc(allowances.createdAt))
    .limit(1);
  return row ?? null;
}

export function toMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    agentId: row.agentId,
    purpose: row.purpose,
    maxTotalCents: row.maxTotalCents,
    categories: row.categories ?? null,
    merchants: row.merchants ?? null,
    expiresAt: row.expiresAt.toISOString(),
    spentCents: row.spentCents,
    status: row.status,
  };
}

/** Everything the policy engine needs to know beyond the request and the policy. */
export async function loadPolicyFacts(
  db: Db,
  agent: AgentRow,
  request: PaymentRequest,
  now: Date,
): Promise<Omit<PolicyContext, "policy" | "now" | "itemLabels">> {
  const policy = agent.policy;

  let mandate: Mandate | null = null;
  if (request.mandateId) {
    const [row] = await db.select().from(mandates).where(and(eq(mandates.id, request.mandateId), eq(mandates.agentId, agent.id)));
    mandate = row ? toMandate(row) : null;
  }

  const since = new Date(now.getTime() - budgetWindowMs(policy.budget.period));
  const [spent] = await db
    .select({ cents: sql<number>`coalesce(sum(${paymentRequests.totalCents}), 0)`.mapWith(Number) })
    .from(paymentRequests)
    .where(and(eq(paymentRequests.agentId, agent.id), inArray(paymentRequests.status, ["approved", "paid"]), gte(paymentRequests.createdAt, since)));

  let paymentsInVelocityWindow = 0;
  if (policy.velocity) {
    const windowStart = new Date(now.getTime() - policy.velocity.windowMinutes * 60_000);
    const [count] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.agentId, agent.id),
          inArray(paymentRequests.status, ["approved", "paid", "held", "awaiting_payer"]),
          gte(paymentRequests.createdAt, windowStart),
        ),
      );
    paymentsInVelocityWindow = count?.n ?? 0;
  }

  const payeeId = request.payee.id.toLowerCase();
  const [known] = await db
    .select({ id: knownPayees.id })
    .from(knownPayees)
    .where(and(eq(knownPayees.ownerId, agent.ownerId), eq(knownPayees.payeeId, payeeId)));

  // A new account under a name the owner already pays is how impersonation scams look.
  let samePayeeNameKnownAs: string | null = null;
  if (!known) {
    const [sameName] = await db
      .select({ payeeId: knownPayees.payeeId })
      .from(knownPayees)
      .where(
        and(
          eq(knownPayees.ownerId, agent.ownerId),
          sql`lower(${knownPayees.name}) = ${request.payee.name.trim().toLowerCase()}`,
          ne(knownPayees.payeeId, payeeId),
        ),
      )
      .limit(1);
    samePayeeNameKnownAs = sameName?.payeeId ?? null;
  }

  const allowance = request.kind === "purchase" ? await activeAllowance(db, agent.ownerId, now) : null;

  return {
    mandate,
    spentInPeriodCents: spent?.cents ?? 0,
    paymentsInVelocityWindow,
    payeeKnown: Boolean(known),
    samePayeeNameKnownAs,
    allowanceRemainingCents: allowance ? allowance.amountCents - allowance.capturedCents : null,
  };
}

// --- What the UI shows ----------------------------------------------------------------------

export type ActivityItem = PaymentRow & { agentName: string; agentKind: AgentRow["kind"]; ownerName: string };

export async function recentActivity(db: Db, limit = 30): Promise<ActivityItem[]> {
  const rows = await db
    .select({ payment: paymentRequests, agentName: agents.name, agentKind: agents.kind, ownerName: people.name })
    .from(paymentRequests)
    .innerJoin(agents, eq(agents.id, paymentRequests.agentId))
    .innerJoin(people, eq(people.id, paymentRequests.ownerId))
    .orderBy(desc(paymentRequests.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.payment, agentName: r.agentName, agentKind: r.agentKind, ownerName: r.ownerName }));
}

export async function activityItem(db: Db, id: string): Promise<ActivityItem | null> {
  const [row] = await db
    .select({ payment: paymentRequests, agentName: agents.name, agentKind: agents.kind, ownerName: people.name })
    .from(paymentRequests)
    .innerJoin(agents, eq(agents.id, paymentRequests.agentId))
    .innerJoin(people, eq(people.id, paymentRequests.ownerId))
    .where(eq(paymentRequests.id, id));
  return row ? { ...row.payment, agentName: row.agentName, agentKind: row.agentKind, ownerName: row.ownerName } : null;
}

export async function ledgerFor(db: Db, requestId: string): Promise<LedgerRow[]> {
  return db.select().from(ledger).where(eq(ledger.requestId, requestId)).orderBy(ledger.createdAt);
}

export async function listAgents(db: Db) {
  return db
    .select({ agent: agents, ownerName: people.name })
    .from(agents)
    .innerJoin(people, eq(people.id, agents.ownerId))
    .orderBy(agents.createdAt);
}

export async function listAllowances(db: Db) {
  return db.select().from(allowances).orderBy(desc(allowances.createdAt)).limit(10);
}

export async function listMandates(db: Db, agentId?: string) {
  const query = db.select().from(mandates);
  return (agentId ? query.where(eq(mandates.agentId, agentId)) : query).orderBy(desc(mandates.createdAt));
}
