// End-to-end tests of the payment service against a real (in-memory) Postgres, with the
// PayPal side simulated and Claude turned off.

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openPglite, type Db } from "@/lib/db/client";
import { allowances, ledger } from "@/lib/db/schema";
import { DEMO_IDS, resetDemo } from "@/lib/demo/seed";
import { runScenario } from "@/lib/demo/scenarios";
import { findAgentByToken } from "./queries";
import { LeashError, resolveHeldPayment, voidAllowance, type ServiceOptions } from "./service";

const NOW = new Date("2026-11-05T15:00:00Z");
const options: ServiceOptions = { now: NOW, reviewer: null, simulatePayPal: true };

let db: Db;
let tokens: Record<string, string>;

beforeEach(async () => {
  db = await openPglite(undefined);
  ({ tokens } = await resetDemo(db, options));
});

const ledgerTypes = async (requestId: string) =>
  (await db.select().from(ledger).where(eq(ledger.requestId, requestId)).orderBy(ledger.createdAt)).map((e) => e.type);

describe("payment service", () => {
  it("pays the weekly groceries from the allowance and pays the merchant", async () => {
    const payment = await runScenario(db, "groceries", options);
    expect(payment.outcome).toBe("approve");
    expect(payment.status).toBe("paid");
    expect(payment.simulated).toBe(true);
    expect(await ledgerTypes(payment.id)).toEqual(["capture", "payout"]);

    const [allowance] = await db.select().from(allowances).where(eq(allowances.ownerId, DEMO_IDS.priya));
    expect(allowance?.capturedCents).toBe(2336);
    expect(payment.explanation).toContain("Paid $23.36");
  });

  it("blocks the poisoned product page and moves no money", async () => {
    const payment = await runScenario(db, "injection", options);
    expect(payment.status).toBe("blocked");
    expect(payment.decision.checks.find((c) => c.id === "heuristic_injection")?.status).toBe("block");
    expect(await ledgerTypes(payment.id)).toEqual([]);
  });

  it("holds the bail scam for Priya, refuses approval while cooling off, and voids on decline", async () => {
    const payment = await runScenario(db, "scam", options);
    expect(payment.status).toBe("held");
    expect(payment.decision.hold).toMatchObject({ approver: "guardian", scamSuspected: true });
    expect(payment.coolingOffUntil?.toISOString()).toBe("2026-11-05T15:30:00.000Z");
    expect(await ledgerTypes(payment.id)).toEqual(["authorization"]);
    // Ramesh has paid the real Arjun before, at a different account.
    expect(payment.decision.checks.find((c) => c.id === "payee_changed")?.status).toBe("hold");

    // Ramesh himself can't release it.
    await expect(resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.ramesh, decision: "approve" }, options)).rejects.toThrow(LeashError);
    // Priya can't approve it before the cooling-off period ends.
    await expect(resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.priya, decision: "approve" }, options)).rejects.toMatchObject({ code: "cooling_off" });

    const declined = await resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.priya, decision: "decline" }, options);
    expect(declined.status).toBe("declined");
    expect(await ledgerTypes(payment.id)).toEqual(["authorization", "void"]);
  });

  it("lets the guardian approve a held transfer after cooling off", async () => {
    const payment = await runScenario(db, "scam", options);
    const later: ServiceOptions = { ...options, now: new Date("2026-11-05T15:31:00Z") };
    const approved = await resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.priya, decision: "approve" }, later);
    expect(approved.status).toBe("paid");
    expect(await ledgerTypes(payment.id)).toEqual(["authorization", "capture", "payout"]);
  });

  it("counts spending towards the task, so a second identical gift goes over the $40 task", async () => {
    const first = await runScenario(db, "telescope", options);
    expect(first.status).toBe("paid");
    const second = await runScenario(db, "telescope", options);
    expect(second.status).toBe("blocked");
    expect(second.decision.checks.find((c) => c.id === "mandate")?.status).toBe("block");
  });

  it("releases the unspent allowance", async () => {
    await runScenario(db, "groceries", options);
    const [allowance] = await db.select().from(allowances).where(eq(allowances.ownerId, DEMO_IDS.priya));
    const voided = await voidAllowance(db, allowance!.id);
    expect(voided.status).toBe("voided");
    const [entry] = await db.select().from(ledger).where(eq(ledger.type, "void"));
    expect(entry?.amountCents).toBe(15000 - 2336);
  });

  it("finds agents by their MCP token", async () => {
    const agent = await findAgentByToken(db, tokens[DEMO_IDS.giftAgent]!);
    expect(agent?.id).toBe(DEMO_IDS.giftAgent);
    expect(await findAgentByToken(db, "lsh_wrong")).toBeNull();
  });
});
