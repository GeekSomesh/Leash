import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents, allowances, ledger, paymentRequests, people } from "@/lib/db/schema";
import type { InsightsCheck, InsightsData, InsightsPayment } from "@/lib/insights-data";
import { errorResponse } from "@/lib/http";

/** Every number the insights dashboard charts, in one snapshot. */
export async function GET() {
  try {
    const db = await getDb();

    const rows = await db
      .select({
        id: paymentRequests.id,
        createdAt: paymentRequests.createdAt,
        agentName: agents.name,
        agentKind: agents.kind,
        ownerName: people.name,
        kind: paymentRequests.kind,
        payeeName: paymentRequests.payeeName,
        totalCents: paymentRequests.totalCents,
        outcome: paymentRequests.outcome,
        status: paymentRequests.status,
        simulated: paymentRequests.simulated,
        decision: paymentRequests.decision,
      })
      .from(paymentRequests)
      .innerJoin(agents, eq(agents.id, paymentRequests.agentId))
      .innerJoin(people, eq(people.id, paymentRequests.ownerId))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(200);

    const payments: InsightsPayment[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      agentName: r.agentName,
      agentKind: r.agentKind,
      ownerName: r.ownerName,
      kind: r.kind,
      payeeName: r.payeeName,
      totalCents: r.totalCents,
      outcome: r.outcome,
      status: r.status,
      simulated: r.simulated,
    }));

    const checks: InsightsCheck[] = rows.flatMap((r) =>
      r.decision.checks.map((check) => ({
        paymentId: r.id,
        createdAt: r.createdAt.toISOString(),
        agentName: r.agentName,
        payeeName: r.payeeName,
        totalCents: r.totalCents,
        id: check.id,
        label: check.label,
        source: check.source,
        status: check.status,
        detail: check.detail,
      })),
    );

    const spend = await db
      .select({
        agentId: paymentRequests.agentId,
        paidCents: sql<number>`coalesce(sum(${paymentRequests.totalCents}), 0)`.mapWith(Number),
        paymentCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(paymentRequests)
      .where(inArray(paymentRequests.status, ["paid", "approved"]))
      .groupBy(paymentRequests.agentId);
    const spendByAgent = new Map(spend.map((s) => [s.agentId, s]));

    const agentRows = await db
      .select({ agent: agents, ownerName: people.name })
      .from(agents)
      .innerJoin(people, eq(people.id, agents.ownerId))
      .orderBy(agents.createdAt);

    const ledgerRows = await db.select().from(ledger).orderBy(desc(ledger.createdAt)).limit(500);
    const allowanceRows = await db.select().from(allowances).orderBy(desc(allowances.createdAt)).limit(50);

    const data: InsightsData = {
      payments,
      checks,
      ledger: ledgerRows.map((e) => ({
        id: e.id,
        paymentId: e.requestId,
        type: e.type,
        amountCents: e.amountCents,
        status: e.status,
        paypalId: e.paypalId,
        simulated: e.simulated,
        createdAt: e.createdAt.toISOString(),
      })),
      allowances: allowanceRows.map((a) => ({
        id: a.id,
        amountCents: a.amountCents,
        capturedCents: a.capturedCents,
        status: a.status,
        simulated: a.simulated,
        periodEnd: a.periodEnd.toISOString(),
      })),
      agents: agentRows.map(({ agent, ownerName }) => ({
        id: agent.id,
        name: agent.name,
        kind: agent.kind,
        ownerName,
        paidCents: spendByAgent.get(agent.id)?.paidCents ?? 0,
        paymentCount: spendByAgent.get(agent.id)?.paymentCount ?? 0,
      })),
    };
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
