// End-to-end tests of the payment service against a real (in-memory) Postgres, with the
// PayPal side simulated and Claude turned off.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openPglite, type Db } from "@/lib/db/client";
import { allowances, ledger, mandates } from "@/lib/db/schema";
import { telescopePurchase } from "@/lib/demo/fixtures";
import { DEMO_IDS, resetDemo } from "@/lib/demo/seed";
import { runScenario } from "@/lib/demo/scenarios";
import { findAgentByToken } from "./queries";
import { agentOrThrow, LeashError, refundPayment, resolveHeldPayment, submitPayment, voidAllowance, type ServiceOptions } from "./service";

const NOW = new Date("2026-11-05T15:00:00Z");
const options: ServiceOptions = { now: NOW, reviewer: null, simulatePayPal: true };

let db: Db;
let tokens: Record<string, string>;

// Booting PGlite and running migrations is the slow part, so it happens once; every test
// then starts from freshly reset demo data.
beforeAll(async () => {
  db = await openPglite(undefined);
});

beforeEach(async () => {
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
    // The explanation no longer says the payment is paused: it matches what happened.
    expect(declined.explanation).toBe("Declined. The hold was released, so the money never left the account.");
  });

  it("lets the guardian approve a held transfer after cooling off", async () => {
    const payment = await runScenario(db, "scam", options);
    const later: ServiceOptions = { ...options, now: new Date("2026-11-05T15:31:00Z") };
    const approved = await resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.priya, decision: "approve" }, later);
    expect(approved.status).toBe("paid");
    expect(await ledgerTypes(payment.id)).toEqual(["authorization", "capture", "payout"]);
    expect(approved.explanation).toBe("Approved, and $2,000.00 was sent to Arjun.");
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

  it("refunds a paid payment to the payer, owner only", async () => {
    const payment = await runScenario(db, "groceries", options);
    expect(payment.status).toBe("paid");

    // Only the owner (Priya) can refund; the voice assistant's owner isn't her.
    await expect(refundPayment(db, { paymentId: payment.id, requesterId: DEMO_IDS.ramesh }, options)).rejects.toMatchObject({ code: "forbidden" });

    const refunded = await refundPayment(db, { paymentId: payment.id, requesterId: DEMO_IDS.priya }, options);
    expect(refunded.status).toBe("refunded");
    expect(await ledgerTypes(payment.id)).toEqual(["capture", "payout", "refund"]);

    // The task gets its budget back; the PayPal allowance doesn't (an authorization can't be re-captured).
    const [mandate] = await db.select().from(mandates).where(eq(mandates.id, DEMO_IDS.groceryMandate));
    expect(mandate?.spentCents).toBe(0);
    const [allowance] = await db.select().from(allowances).where(eq(allowances.ownerId, DEMO_IDS.priya));
    expect(allowance?.capturedCents).toBe(2336);

    // A refunded payment has nothing left to refund.
    await expect(refundPayment(db, { paymentId: payment.id, requesterId: DEMO_IDS.priya }, options)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("explains a declined purchase without mentioning a hold that never existed", async () => {
    // Electronics always need approval for the gift agent, so this purchase is held.
    const request = telescopePurchase(DEMO_IDS.giftMandate);
    request.items[0]!.declaredCategory = "electronics";
    const mandateFree = { ...request, mandateId: null };
    const payment = await submitPayment(db, await agentOrThrow(db, DEMO_IDS.giftAgent), mandateFree, options);
    expect(payment.status).toBe("held");

    const declined = await resolveHeldPayment(db, { paymentId: payment.id, approverId: DEMO_IDS.priya, decision: "decline" }, options);
    expect(declined.status).toBe("declined");
    expect(declined.explanation).toBe("Declined, so nothing was charged for $34.99 at Orbit Toys.");
    expect(await ledgerTypes(payment.id)).toEqual([]);
  });

  it("finds agents by their MCP token", async () => {
    const agent = await findAgentByToken(db, tokens[DEMO_IDS.giftAgent]!);
    expect(agent?.id).toBe(DEMO_IDS.giftAgent);
    expect(await findAgentByToken(db, "lsh_wrong")).toBeNull();
  });
});
