// Leash's write side: decide on a payment and move the money accordingly.
//
// Purchases capture from the owner's PayPal allowance (an authorization they approved) and
// the merchant is paid through PayPal Payouts. Transfers get their own authorization, which
// the payer approves in PayPal; Leash captures it only when the decision (or a guardian)
// allows, and voids it otherwise, so held money never moves.
//
// Without PayPal sandbox keys, Leash simulates the PayPal side. Simulated rows are flagged
// and labelled in the UI; they never pretend to be real sandbox transactions.

import { and, eq, sql } from "drizzle-orm";
import { explainDecision } from "@/lib/ai/explain";
import { claudeConfigured } from "@/lib/ai/claude";
import { appBaseUrl } from "@/lib/config";
import { reviewPayment } from "@/lib/ai/review";
import type { Db } from "@/lib/db/client";
import { allowances, approvals, knownPayees, ledger, mandates, paymentRequests } from "@/lib/db/schema";
import { decide, type Reviewer } from "@/lib/decision/pipeline";
import { PaymentRequestSchema, type Decision, type PaymentRequest } from "@/lib/domain/schemas";
import { formatUsd } from "@/lib/money";
import { PayPalApiError, paypalConfigured } from "@/lib/paypal/client";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  createPayout,
  refundCapture,
  voidAuthorization,
} from "@/lib/paypal/payments";
import { newId, simulatedPayPalId } from "./ids";
import {
  activeAllowance,
  getAgent,
  getPayment,
  getPerson,
  guardianFor,
  loadPolicyFacts,
  type AgentRow,
  type AllowanceRow,
  type PaymentRow,
} from "./queries";

export class LeashError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "cooling_off" | "invalid_state" | "paypal",
  ) {
    super(message);
    this.name = "LeashError";
  }
}

export type ServiceOptions = {
  now?: Date;
  /** Override Claude's reviewer (tests). `null` turns the review off. */
  reviewer?: Reviewer | null;
  /** Force simulation of the PayPal side even when keys are configured (tests). */
  simulatePayPal?: boolean;
};

const paypalEnabled = (options: ServiceOptions) => !options.simulatePayPal && paypalConfigured();

// --- Submitting a payment -----------------------------------------------------------------

export async function submitPayment(db: Db, agent: AgentRow, input: PaymentRequest, options: ServiceOptions = {}): Promise<PaymentRow> {
  const request = PaymentRequestSchema.parse(input);
  const now = options.now ?? new Date();
  const facts = await loadPolicyFacts(db, agent, request, now);
  const guardian = await guardianFor(db, agent.ownerId);
  const reviewer = options.reviewer !== undefined ? options.reviewer : claudeConfigured() ? reviewPayment : null;

  const decision = await decide({
    request,
    context: { ...facts, policy: agent.policy, now },
    reviewer,
    hasGuardian: Boolean(guardian),
  });
  // The stored decision keeps the checks built from Claude's review, not the raw review.
  const storedDecision: Decision = { outcome: decision.outcome, checks: decision.checks, reasons: decision.reasons, hold: decision.hold };

  const id = newId("pay");
  const allowance = request.kind === "purchase" ? await activeAllowance(db, agent.ownerId, now) : null;
  // A purchase captures from its allowance, so it is simulated exactly when the allowance is.
  const simulated = allowance ? allowance.simulated : !paypalEnabled(options);

  await db.insert(paymentRequests).values({
    id,
    agentId: agent.id,
    ownerId: agent.ownerId,
    mandateId: request.mandateId,
    kind: request.kind,
    payeeId: request.payee.id.toLowerCase(),
    payeeName: request.payee.name,
    totalCents: request.totalCents,
    request,
    outcome: decision.outcome,
    status: decision.outcome === "block" ? "blocked" : decision.outcome === "hold" ? "held" : "approved",
    decision: storedDecision,
    explanation: null,
    allowanceId: allowance?.id ?? null,
    simulated,
    coolingOffUntil: decision.hold?.coolingOffUntil ? new Date(decision.hold.coolingOffUntil) : null,
    createdAt: now,
    resolvedAt: decision.outcome === "block" ? now : null,
  });

  if (request.kind === "purchase" && decision.outcome === "approve") {
    await executePurchase(db, id, options);
  } else if (request.kind === "transfer" && decision.outcome !== "block") {
    await startTransferHold(db, id, options);
  }

  await writeExplanation(db, id, agent, guardian?.name ?? null);
  return (await getPayment(db, id))!;
}

/** Writes the plain explanation for a decision (Claude when configured, else a template). */
async function writeExplanation(db: Db, paymentId: string, agent: AgentRow, guardianName: string | null) {
  const payment = (await getPayment(db, paymentId))!;
  const owner = await getPerson(db, agent.ownerId);
  // A held payment that was approved or declined later needs a new explanation: the old one
  // still says it's paused, so it matches what actually happened instead.
  const resolvedStatus =
    payment.decision.outcome === "hold" && (payment.status === "declined" || payment.status === "paid" || payment.status === "failed")
      ? payment.status
      : undefined;
  const explanation = await explainDecision({
    request: payment.request,
    decision: payment.decision,
    audience: agent.kind === "voice_assistant" ? "payer" : "owner",
    language: owner?.language ?? "English",
    payerName: owner?.name ?? "the owner",
    guardianName,
    resolvedStatus,
  });
  await db.update(paymentRequests).set({ explanation }).where(eq(paymentRequests.id, paymentId));
}

// --- Purchases: capture from the allowance, then pay the merchant ----------------------------

async function executePurchase(db: Db, paymentId: string, options: ServiceOptions) {
  const payment = (await getPayment(db, paymentId))!;
  const now = options.now ?? new Date();
  const allowance = payment.allowanceId ? await getAllowance(db, payment.allowanceId) : await activeAllowance(db, payment.ownerId, now);
  if (!allowance || allowance.status !== "active" || allowance.amountCents - allowance.capturedCents < payment.totalCents) {
    return fail(db, paymentId, "There isn't enough left of the PayPal allowance for this purchase.");
  }

  try {
    const captureId = allowance.simulated
      ? simulatedPayPalId("CAPTURE")
      : (
          await captureAuthorization(allowance.paypalAuthorizationId!, {
            amountCents: payment.totalCents,
            finalCapture: false,
            invoiceId: payment.id,
            noteToPayer: `${payment.payeeName}, approved by Leash`,
            requestId: `${payment.id}-capture`,
          })
        ).captureId;

    await db
      .update(allowances)
      .set({ capturedCents: sql`${allowances.capturedCents} + ${payment.totalCents}` })
      .where(eq(allowances.id, allowance.id));
    await recordLedger(db, { requestId: paymentId, allowanceId: allowance.id, type: "capture", amountCents: payment.totalCents, paypalId: captureId, status: "COMPLETED", simulated: allowance.simulated });

    if (payment.mandateId) {
      await db
        .update(mandates)
        .set({ spentCents: sql`${mandates.spentCents} + ${payment.totalCents}` })
        .where(eq(mandates.id, payment.mandateId));
    }

    await payOut(db, payment, allowance.simulated, "merchant");
    await rememberPayee(db, payment);
    await db
      .update(paymentRequests)
      .set({ status: "paid", paypalCaptureId: captureId, allowanceId: allowance.id, resolvedAt: now })
      .where(eq(paymentRequests.id, paymentId));
  } catch (error) {
    if (error instanceof PayPalApiError) return fail(db, paymentId, `PayPal: ${error.issue ?? error.status} (debug id ${error.debugId ?? "n/a"})`);
    throw error;
  }
}

// --- Transfers: a hold the payer approves, captured only when allowed --------------------------

async function startTransferHold(db: Db, paymentId: string, options: ServiceOptions) {
  const payment = (await getPayment(db, paymentId))!;

  if (!paypalEnabled(options)) {
    // Simulated: pretend the payer approved the hold in PayPal straight away.
    const authorizationId = simulatedPayPalId("AUTH");
    await db.update(paymentRequests).set({ paypalAuthorizationId: authorizationId }).where(eq(paymentRequests.id, paymentId));
    await recordLedger(db, { requestId: paymentId, type: "authorization", amountCents: payment.totalCents, paypalId: authorizationId, status: "CREATED", simulated: true, detail: "Hold placed (simulated)" });
    if (payment.outcome === "approve") await captureTransfer(db, paymentId, options);
    return;
  }

  try {
    const order = await createAuthorizeOrder({
      amountCents: payment.totalCents,
      description: `Leash: ${formatUsd(payment.totalCents)} to ${payment.payeeName}`,
      referenceId: payment.id,
      returnUrl: `${appBaseUrl()}/paypal/return`,
      cancelUrl: `${appBaseUrl()}/paypal/cancel`,
      requestId: `${payment.id}-order`,
    });
    await db
      .update(paymentRequests)
      .set({ status: "awaiting_payer", paypalOrderId: order.orderId, approveUrl: order.approveUrl })
      .where(eq(paymentRequests.id, paymentId));
  } catch (error) {
    if (error instanceof PayPalApiError) return fail(db, paymentId, `PayPal: ${error.issue ?? error.status}`);
    throw error;
  }
}

/** Called when a payer comes back from approving a transfer hold in PayPal. */
async function completeTransferApproval(db: Db, payment: PaymentRow, options: ServiceOptions) {
  const authorization = await authorizeOrder(payment.paypalOrderId!, `${payment.id}-authorize`);
  await recordLedger(db, { requestId: payment.id, type: "authorization", amountCents: authorization.amountCents, paypalId: authorization.authorizationId, status: authorization.status, simulated: false, detail: "Hold placed in PayPal" });
  await db
    .update(paymentRequests)
    .set({ paypalAuthorizationId: authorization.authorizationId, status: payment.outcome === "hold" ? "held" : "approved" })
    .where(eq(paymentRequests.id, payment.id));
  if (payment.outcome === "approve") await captureTransfer(db, payment.id, options);
}

async function captureTransfer(db: Db, paymentId: string, options: ServiceOptions) {
  const payment = (await getPayment(db, paymentId))!;
  const now = options.now ?? new Date();
  try {
    const captureId = payment.simulated
      ? simulatedPayPalId("CAPTURE")
      : (
          await captureAuthorization(payment.paypalAuthorizationId!, {
            amountCents: payment.totalCents,
            finalCapture: true,
            invoiceId: payment.id,
            requestId: `${payment.id}-capture`,
          })
        ).captureId;
    await recordLedger(db, { requestId: paymentId, type: "capture", amountCents: payment.totalCents, paypalId: captureId, status: "COMPLETED", simulated: payment.simulated });
    await payOut(db, payment, payment.simulated, "person");
    await rememberPayee(db, payment);
    await db.update(paymentRequests).set({ status: "paid", paypalCaptureId: captureId, resolvedAt: now }).where(eq(paymentRequests.id, paymentId));
  } catch (error) {
    if (error instanceof PayPalApiError) return fail(db, paymentId, `PayPal: ${error.issue ?? error.status} (debug id ${error.debugId ?? "n/a"})`);
    throw error;
  }
}

// --- Approving or declining a held payment --------------------------------------------------

export async function resolveHeldPayment(
  db: Db,
  input: { paymentId: string; approverId: string; decision: "approve" | "decline"; note?: string },
  options: ServiceOptions = {},
): Promise<PaymentRow> {
  const now = options.now ?? new Date();
  const payment = await getPayment(db, input.paymentId);
  if (!payment) throw new LeashError("Payment not found.", "not_found");
  if (payment.status !== "held") throw new LeashError(`This payment is ${payment.status}, not waiting for approval.`, "invalid_state");
  const guardian = await guardianFor(db, payment.ownerId);

  const approvers = await allowedApprovers(db, payment);
  if (!approvers.includes(input.approverId)) throw new LeashError("You can't approve this payment.", "forbidden");
  if (input.decision === "approve" && payment.coolingOffUntil && payment.coolingOffUntil > now) {
    throw new LeashError(`This payment is cooling off until ${payment.coolingOffUntil.toISOString()}.`, "cooling_off");
  }

  await db.insert(approvals).values({ id: newId("apv"), requestId: payment.id, approverId: input.approverId, decision: input.decision, note: input.note ?? null, createdAt: now });

  if (input.decision === "decline") {
    if (payment.kind === "transfer" && payment.paypalAuthorizationId) {
      const voidId = payment.simulated ? simulatedPayPalId("VOID") : (await voidAuthorization(payment.paypalAuthorizationId, `${payment.id}-void`), payment.paypalAuthorizationId);
      await recordLedger(db, { requestId: payment.id, type: "void", amountCents: payment.totalCents, paypalId: voidId, status: "VOIDED", simulated: payment.simulated, detail: "Hold released; the money never moved" });
    }
    await db.update(paymentRequests).set({ status: "declined", resolvedAt: now }).where(eq(paymentRequests.id, payment.id));
    const agent = await agentOrThrow(db, payment.agentId);
    await writeExplanation(db, payment.id, agent, guardian?.name ?? null);
    return (await getPayment(db, payment.id))!;
  }

  // "owner_and_guardian" needs both people to approve.
  const approvedBy = new Set(
    (await db.select({ who: approvals.approverId }).from(approvals).where(and(eq(approvals.requestId, payment.id), eq(approvals.decision, "approve")))).map((r) => r.who),
  );
  if (!approvers.every((id) => approvedBy.has(id))) return payment;

  await db.update(paymentRequests).set({ status: "approved" }).where(eq(paymentRequests.id, payment.id));
  if (payment.kind === "purchase") await executePurchase(db, payment.id, options);
  else await captureTransfer(db, payment.id, options);
  const agent = await agentOrThrow(db, payment.agentId);
  await writeExplanation(db, payment.id, agent, guardian?.name ?? null);
  return (await getPayment(db, payment.id))!;
}

/** Who may approve a held payment, from the decision's approver rule. */
export async function allowedApprovers(db: Db, payment: PaymentRow): Promise<string[]> {
  const guardian = await guardianFor(db, payment.ownerId);
  const rule = (payment.decision as Decision).hold?.approver ?? "owner";
  if (rule === "guardian" && guardian) return [guardian.id];
  if (rule === "owner_and_guardian" && guardian) return [payment.ownerId, guardian.id];
  return [payment.ownerId];
}

// --- Refunding a paid payment ---------------------------------------------------------------

/**
 * Returns a captured payment to the payer. Only the owner acts (from the console). The
 * refund goes back to the payer's PayPal account; the allowance's captured counter is left
 * as the ledger recorded it, since the money's round trip is visible there.
 */
export async function refundPayment(
  db: Db,
  input: { paymentId: string; requesterId: string },
  options: ServiceOptions = {},
): Promise<PaymentRow> {
  const payment = await getPayment(db, input.paymentId);
  if (!payment) throw new LeashError("Payment not found.", "not_found");
  if (payment.status !== "paid") throw new LeashError(`This payment is ${payment.status}, so there is nothing to refund.`, "invalid_state");
  if (input.requesterId !== payment.ownerId) throw new LeashError("Only the owner can refund this payment.", "forbidden");

  try {
    const refundId = payment.simulated
      ? simulatedPayPalId("REFUND")
      : (
          await refundCapture(payment.paypalCaptureId!, {
            amountCents: payment.totalCents,
            noteToPayer: `Refund for ${payment.payeeName} through Leash (${payment.id})`,
            requestId: `${payment.id}-refund`,
          })
        ).refundId;
    await recordLedger(db, { requestId: payment.id, type: "refund", amountCents: payment.totalCents, paypalId: refundId, status: "COMPLETED", simulated: payment.simulated, detail: "Refunded to the payer" });
    await db.update(paymentRequests).set({ status: "refunded", resolvedAt: options.now ?? new Date() }).where(eq(paymentRequests.id, payment.id));
  } catch (error) {
    if (error instanceof PayPalApiError) {
      await fail(db, payment.id, `PayPal: ${error.issue ?? error.status} (debug id ${error.debugId ?? "n/a"})`);
      return (await getPayment(db, payment.id))!;
    }
    throw error;
  }
  return (await getPayment(db, payment.id))!;
}

// --- Allowances --------------------------------------------------------------------------------

export async function requestAllowance(
  db: Db,
  input: { ownerId: string; amountCents: number; days: number },
  options: ServiceOptions = {},
): Promise<AllowanceRow> {
  const now = options.now ?? new Date();
  const id = newId("alw");
  const periodEnd = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);

  if (!paypalEnabled(options)) {
    const authorizationId = simulatedPayPalId("AUTH");
    await db.insert(allowances).values({ id, ownerId: input.ownerId, amountCents: input.amountCents, status: "active", paypalAuthorizationId: authorizationId, simulated: true, periodEnd, authorizedAt: now, createdAt: now });
    await recordLedger(db, { allowanceId: id, type: "authorization", amountCents: input.amountCents, paypalId: authorizationId, status: "CREATED", simulated: true, detail: "Allowance held (simulated)" });
    return (await getAllowance(db, id))!;
  }

  const order = await createAuthorizeOrder({
    amountCents: input.amountCents,
    description: `Leash agent allowance: ${formatUsd(input.amountCents)} held for ${input.days} days`,
    referenceId: id,
    returnUrl: `${appBaseUrl()}/paypal/return`,
    cancelUrl: `${appBaseUrl()}/paypal/cancel`,
    requestId: `${id}-order`,
  });
  await db.insert(allowances).values({ id, ownerId: input.ownerId, amountCents: input.amountCents, status: "awaiting_approval", paypalOrderId: order.orderId, approveUrl: order.approveUrl, simulated: false, periodEnd, createdAt: now });
  return (await getAllowance(db, id))!;
}

/** Releases what's left of an allowance. The owner is never charged for what agents didn't spend. */
export async function voidAllowance(db: Db, allowanceId: string): Promise<AllowanceRow> {
  const allowance = await getAllowance(db, allowanceId);
  if (!allowance) throw new LeashError("Allowance not found.", "not_found");
  if (allowance.status !== "active") throw new LeashError(`This allowance is ${allowance.status}.`, "invalid_state");
  const voidId = allowance.simulated ? simulatedPayPalId("VOID") : (await voidAuthorization(allowance.paypalAuthorizationId!, `${allowance.id}-void`), allowance.paypalAuthorizationId);
  await recordLedger(db, { allowanceId, type: "void", amountCents: allowance.amountCents - allowance.capturedCents, paypalId: voidId, status: "VOIDED", simulated: allowance.simulated, detail: "Unspent allowance released" });
  await db.update(allowances).set({ status: "voided" }).where(eq(allowances.id, allowanceId));
  return (await getAllowance(db, allowanceId))!;
}

/**
 * PayPal sends the payer back here (?token=<order id>) after they approve an allowance or a
 * transfer hold. Authorizes the order and carries on with the flow it belongs to.
 */
export async function handlePayerReturn(db: Db, orderId: string, options: ServiceOptions = {}): Promise<{ kind: "allowance" | "payment"; id: string }> {
  const [allowance] = await db.select().from(allowances).where(eq(allowances.paypalOrderId, orderId));
  if (allowance) {
    if (allowance.status === "awaiting_approval") {
      const authorization = await authorizeOrder(orderId, `${allowance.id}-authorize`);
      await db
        .update(allowances)
        .set({ status: "active", paypalAuthorizationId: authorization.authorizationId, authorizedAt: options.now ?? new Date() })
        .where(eq(allowances.id, allowance.id));
      await recordLedger(db, { allowanceId: allowance.id, type: "authorization", amountCents: authorization.amountCents, paypalId: authorization.authorizationId, status: authorization.status, simulated: false, detail: "Allowance held in PayPal" });
    }
    return { kind: "allowance", id: allowance.id };
  }

  const [payment] = await db.select().from(paymentRequests).where(eq(paymentRequests.paypalOrderId, orderId));
  if (!payment) throw new LeashError("No allowance or payment matches this PayPal order.", "not_found");
  if (payment.status === "awaiting_payer") await completeTransferApproval(db, payment, options);
  return { kind: "payment", id: payment.id };
}

// --- Helpers ------------------------------------------------------------------------------------

async function getAllowance(db: Db, id: string): Promise<AllowanceRow | null> {
  const [row] = await db.select().from(allowances).where(eq(allowances.id, id));
  return row ?? null;
}

const MERCHANT_EMAIL_ENV: Record<string, string> = {
  freshcart: "DEMO_MERCHANT_FRESHCART_EMAIL",
  "orbit-toys": "DEMO_MERCHANT_ORBITTOYS_EMAIL",
};

/** Where the money goes: the payee's own PayPal email, or the sandbox account configured for a demo merchant. */
function payoutEmail(payment: PaymentRow): string | null {
  if (payment.request.payee.paypalEmail) return payment.request.payee.paypalEmail;
  const envName = MERCHANT_EMAIL_ENV[payment.payeeId];
  return (envName && process.env[envName]) || null;
}

async function payOut(db: Db, payment: PaymentRow, simulated: boolean, to: "merchant" | "person") {
  const receiver = payoutEmail(payment);
  if (!receiver && !simulated) {
    await recordLedger(db, { requestId: payment.id, type: "payout", amountCents: payment.totalCents, paypalId: null, status: "SKIPPED", simulated, detail: `No sandbox email configured for ${payment.payeeName}` });
    return;
  }
  const batchId = simulated
    ? simulatedPayPalId("PAYOUT")
    : (
        await createPayout({
          senderBatchId: `${payment.id}-payout`,
          emailSubject: to === "merchant" ? `Payment for your order (${payment.payeeName})` : "You've received money",
          items: [{ receiverEmail: receiver!, amountCents: payment.totalCents, note: `Paid through Leash for request ${payment.id}`, senderItemId: payment.id }],
        })
      ).batchId;
  await recordLedger(db, { requestId: payment.id, type: "payout", amountCents: payment.totalCents, paypalId: batchId, status: simulated ? "SUCCESS" : "PENDING", simulated, detail: `Paid to ${receiver ?? payment.payeeName}` });
}

async function rememberPayee(db: Db, payment: PaymentRow) {
  await db
    .insert(knownPayees)
    .values({ id: newId("pye"), ownerId: payment.ownerId, payeeId: payment.payeeId, name: payment.payeeName })
    .onConflictDoNothing();
}

async function recordLedger(db: Db, entry: Omit<typeof ledger.$inferInsert, "id">) {
  await db.insert(ledger).values({ id: newId("led"), ...entry });
}

async function fail(db: Db, paymentId: string, failure: string) {
  await db.update(paymentRequests).set({ status: "failed", failure, resolvedAt: new Date() }).where(eq(paymentRequests.id, paymentId));
}

export async function agentOrThrow(db: Db, agentId: string): Promise<AgentRow> {
  const agent = await getAgent(db, agentId);
  if (!agent) throw new LeashError(`Agent ${agentId} not found.`, "not_found");
  return agent;
}
