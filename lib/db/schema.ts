// Leash's database. Postgres in production (Render); PGlite (embedded Postgres) locally.

import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Category, Decision, PaymentRequest, Policy } from "@/lib/domain/schemas";

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);

export const people = pgTable("people", {
  id: id(),
  name: text("name").notNull(),
  /** Sandbox PayPal email, used as the payee when someone sends this person money. */
  paypalEmail: text("paypal_email"),
  /** Language for explanations (e.g. "English", "Hindi"). */
  language: text("language").notNull().default("English"),
  createdAt: createdAt(),
});

/** A guardian approves risky payments for a person (Priya for her father Ramesh). */
export const guardianships = pgTable(
  "guardianships",
  {
    id: id(),
    personId: text("person_id").notNull().references(() => people.id),
    guardianId: text("guardian_id").notNull().references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("guardianships_person_idx").on(t.personId)],
);

export const agents = pgTable(
  "agents",
  {
    id: id(),
    ownerId: text("owner_id").notNull().references(() => people.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["shopping", "voice_assistant", "external"] }).notNull(),
    /** SHA-256 of the agent's MCP bearer token; the token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull(),
    policy: jsonb("policy").$type<Policy>().notNull(),
    /** The owner's plain-English rules the policy was compiled from. */
    policySource: text("policy_source").notNull(),
    policyUpdatedAt: timestamp("policy_updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agents_token_hash_idx").on(t.tokenHash)],
);

export const mandates = pgTable(
  "mandates",
  {
    id: id(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    purpose: text("purpose").notNull(),
    maxTotalCents: integer("max_total_cents").notNull(),
    categories: jsonb("categories").$type<Category[] | null>(),
    merchants: jsonb("merchants").$type<string[] | null>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    status: text("status", { enum: ["active", "completed", "revoked"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("mandates_agent_idx").on(t.agentId)],
);

/**
 * A PayPal authorization the owner approved: money held on their PayPal account that agent
 * purchases capture from. Whatever isn't captured is voided, so it's never charged.
 */
export const allowances = pgTable(
  "allowances",
  {
    id: id(),
    ownerId: text("owner_id").notNull().references(() => people.id),
    amountCents: integer("amount_cents").notNull(),
    capturedCents: integer("captured_cents").notNull().default(0),
    status: text("status", { enum: ["awaiting_approval", "active", "voided", "expired", "cancelled"] }).notNull(),
    paypalOrderId: text("paypal_order_id"),
    paypalAuthorizationId: text("paypal_authorization_id"),
    approveUrl: text("approve_url"),
    /** True when PayPal isn't configured and Leash simulated the PayPal side (clearly labelled in the UI). */
    simulated: boolean("simulated").notNull().default(false),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("allowances_owner_idx").on(t.ownerId)],
);

/** Payees an owner has paid before. The first payment to anyone else counts as a new payee. */
export const knownPayees = pgTable(
  "known_payees",
  {
    id: id(),
    ownerId: text("owner_id").notNull().references(() => people.id),
    payeeId: text("payee_id").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("known_payees_owner_payee_idx").on(t.ownerId, t.payeeId)],
);

export const PAYMENT_STATUSES = [
  "approved", // decided "approve"; money is being moved
  "awaiting_payer", // a transfer waiting for the payer to approve the hold in PayPal
  "held", // waiting for an approver
  "blocked",
  "paid", // captured (and paid out, if a payout was needed)
  "declined", // an approver said no; any hold was voided
  "failed", // PayPal returned an error
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: id(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    ownerId: text("owner_id").notNull().references(() => people.id),
    mandateId: text("mandate_id"),
    kind: text("kind", { enum: ["purchase", "transfer"] }).notNull(),
    payeeId: text("payee_id").notNull(),
    payeeName: text("payee_name").notNull(),
    totalCents: integer("total_cents").notNull(),
    request: jsonb("request").$type<PaymentRequest>().notNull(),
    outcome: text("outcome", { enum: ["approve", "hold", "block"] }).notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
    decision: jsonb("decision").$type<Decision>().notNull(),
    explanation: text("explanation"),
    /** For transfers: the PayPal order the payer approves, and the resulting authorization. */
    paypalOrderId: text("paypal_order_id"),
    paypalAuthorizationId: text("paypal_authorization_id"),
    approveUrl: text("approve_url"),
    /** For purchases: the allowance the payment captures from. */
    allowanceId: text("allowance_id"),
    paypalCaptureId: text("paypal_capture_id"),
    simulated: boolean("simulated").notNull().default(false),
    coolingOffUntil: timestamp("cooling_off_until", { withTimezone: true }),
    failure: text("failure"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("payment_requests_agent_created_idx").on(t.agentId, t.createdAt), index("payment_requests_owner_idx").on(t.ownerId)],
);

export const approvals = pgTable("approvals", {
  id: id(),
  requestId: text("request_id").notNull().references(() => paymentRequests.id),
  approverId: text("approver_id").notNull().references(() => people.id),
  decision: text("decision", { enum: ["approve", "decline"] }).notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

/** Every money movement in PayPal, with its PayPal id: authorizations, captures, voids, payouts, refunds. */
export const ledger = pgTable(
  "ledger",
  {
    id: id(),
    requestId: text("request_id"),
    allowanceId: text("allowance_id"),
    type: text("type", { enum: ["authorization", "capture", "void", "payout", "refund", "reauthorization"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    paypalId: text("paypal_id"),
    status: text("status").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_paypal_id_idx").on(t.paypalId)],
);

/** Webhook deliveries from PayPal, kept for audit. */
export const paypalEvents = pgTable("paypal_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().default(sql`now()`),
});
