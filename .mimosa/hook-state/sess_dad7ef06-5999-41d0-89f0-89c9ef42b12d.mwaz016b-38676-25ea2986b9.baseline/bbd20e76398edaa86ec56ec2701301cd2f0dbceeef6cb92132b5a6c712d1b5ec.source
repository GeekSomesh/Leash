// The shared vocabulary of Leash: spending policies, task mandates, payment requests and
// decisions. These zod schemas are the single source of truth: the policy engine, the
// Claude structured outputs, the MCP tool inputs and the database JSON columns all use them.

import { z } from "zod";

// --- Categories ---------------------------------------------------------------------

export const CATEGORIES = [
  "groceries",
  "household",
  "restaurants_food_delivery",
  "toys_games",
  "books_media",
  "clothing",
  "electronics",
  "home_garden",
  "health_beauty",
  "pets",
  "travel",
  "transport",
  "entertainment_events",
  "education",
  "charity",
  "bills_utilities",
  "software_digital_goods",
  "subscriptions",
  "services",
  "gift_cards",
  "prepaid_cards",
  "crypto",
  "money_transfer",
  "alcohol",
  "tobacco_vaping",
  "gambling",
  "weapons",
  "adult",
  "other",
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

/** Things that work like cash: once bought or sent, the money is effectively gone. Scammers ask for these. */
export const CASH_EQUIVALENTS: readonly Category[] = ["gift_cards", "prepaid_cards", "crypto", "money_transfer"];

export const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "groceries",
  household: "household supplies",
  restaurants_food_delivery: "restaurants and food delivery",
  toys_games: "toys and games",
  books_media: "books and media",
  clothing: "clothing",
  electronics: "electronics",
  home_garden: "home and garden",
  health_beauty: "health and beauty",
  pets: "pet supplies",
  travel: "travel",
  transport: "transport",
  entertainment_events: "entertainment and events",
  education: "education",
  charity: "charity",
  bills_utilities: "bills and utilities",
  software_digital_goods: "software and digital goods",
  subscriptions: "subscriptions",
  services: "services",
  gift_cards: "gift cards",
  prepaid_cards: "prepaid cards",
  crypto: "crypto",
  money_transfer: "money transfers",
  alcohol: "alcohol",
  tobacco_vaping: "tobacco and vaping",
  gambling: "gambling",
  weapons: "weapons",
  adult: "adult content",
  other: "other",
};

// --- Policy ---------------------------------------------------------------------------

const cents = z.number().int().min(0);

export const ApproverSchema = z.enum(["owner", "guardian", "owner_and_guardian"]);
export type Approver = z.infer<typeof ApproverSchema>;

export const PolicySchema = z.object({
  version: z.literal(1),
  currency: z.literal("USD"),
  budget: z.object({
    period: z.enum(["day", "week", "month"]).describe("Rolling window: day = 24 hours, week = 7 days, month = 30 days"),
    limitCents: cents.describe("Most this agent may spend in one rolling period, in US cents"),
  }),
  perPayment: z.object({
    maxCents: cents.describe("Hard limit for a single payment, in cents. Anything above is blocked."),
    askAboveCents: cents.nullable().describe("Payments above this amount (in cents) need a human approval. null = never ask on amount alone"),
  }),
  categories: z.object({
    blocked: z.array(CategorySchema).describe("Never allowed"),
    askFor: z.array(CategorySchema).describe("Allowed, but a human must approve each time"),
    allowedOnly: z.array(CategorySchema).nullable().describe("If set, anything outside these categories needs a human approval. null = no allow-list"),
  }),
  blockCashEquivalents: z.boolean().describe("Block gift cards, prepaid cards and crypto purchases"),
  merchants: z.object({
    blocked: z.array(z.string()).describe("Merchant ids or names that are never allowed"),
    allowedOnly: z.array(z.string()).nullable().describe("If set, other merchants need a human approval. null = any merchant"),
  }),
  newPayee: z.object({
    action: z.enum(["allow", "ask", "block"]).describe("What to do the first time money goes to a merchant or person"),
  }),
  transfers: z.object({
    enabled: z.boolean().describe("Whether this agent may send money to people at all"),
    askAboveCents: cents.nullable().describe("Transfers to people above this amount need approval. null = only the other rules apply"),
  }),
  velocity: z
    .object({
      maxPayments: z.number().int().min(1),
      windowMinutes: z.number().int().min(1),
    })
    .nullable()
    .describe("More payments than this inside the window need approval. null = no limit"),
  quietHours: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
      timezone: z.string().describe("IANA time zone, e.g. America/New_York"),
    })
    .nullable()
    .describe("Payments during these hours need approval. null = none"),
  requireMandate: z.boolean().describe("Purchases must belong to a task the owner gave the agent"),
  approval: z.object({
    approver: ApproverSchema.describe("Who approves held payments"),
    coolingOffMinutes: cents.describe("When a payment looks like a scam, how long it is held before it can be approved"),
  }),
});
export type Policy = z.infer<typeof PolicySchema>;

// --- Mandates ---------------------------------------------------------------------------

export const MandateSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  purpose: z.string().describe("The task in the owner's words, e.g. 'Space-themed gift for Maya's 10th birthday'"),
  maxTotalCents: cents,
  categories: z.array(CategorySchema).nullable(),
  merchants: z.array(z.string()).nullable(),
  expiresAt: z.string().describe("ISO 8601"),
  spentCents: cents,
  status: z.enum(["active", "completed", "revoked"]),
});
export type Mandate = z.infer<typeof MandateSchema>;

// --- Payment requests ----------------------------------------------------------------

export const PayeeSchema = z.object({
  id: z.string().describe("Stable id: a merchant id, or a person's PayPal email"),
  name: z.string(),
  type: z.enum(["merchant", "person"]),
  paypalEmail: z.string().nullable().describe("Where PayPal Payouts sends the money"),
  declaredCategories: z.array(CategorySchema).describe("Categories the merchant declares for itself"),
});
export type Payee = z.infer<typeof PayeeSchema>;

export const LineItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPriceCents: cents,
  url: z.string().nullable(),
  declaredCategory: CategorySchema.nullable().describe("Category the merchant's catalog gives the item, if any"),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const EvidenceSchema = z.object({
  source: z.enum(["web_page", "email", "chat_message", "voice_transcript", "user_instruction", "other"]),
  url: z.string().nullable(),
  content: z.string().describe("The text the agent read or heard before deciding to pay"),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const PaymentRequestSchema = z.object({
  kind: z.enum(["purchase", "transfer"]),
  mandateId: z.string().nullable(),
  payee: PayeeSchema,
  items: z.array(LineItemSchema),
  shippingCents: cents,
  taxCents: cents,
  totalCents: cents,
  justification: z.string().describe("Why the agent wants to make this payment"),
  evidence: z.array(EvidenceSchema),
});
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

// --- Decisions ------------------------------------------------------------------------

export const OUTCOMES = ["approve", "hold", "block"] as const;
export type Outcome = (typeof OUTCOMES)[number];

const SEVERITY: Record<Outcome, number> = { approve: 0, hold: 1, block: 2 };

/** The stricter of two outcomes. Decisions only ever move towards "block". */
export function stricter(a: Outcome, b: Outcome): Outcome {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export type CheckStatus = "pass" | "hold" | "block" | "info" | "skipped";

export type Check = {
  id: string;
  label: string;
  /** "rule" checks are deterministic code; "ai" checks come from Claude; "heuristic" are fixed patterns. */
  source: "rule" | "heuristic" | "ai";
  status: CheckStatus;
  detail: string;
  /** A short, plain sentence for explanations, when the detail is too technical to lead with. */
  headline?: string;
  /** Exact text the check is about (e.g. an injected instruction), for highlighting in the UI. */
  quotes?: string[];
};

export type Decision = {
  outcome: Outcome;
  checks: Check[];
  /** Short reasons for anything that held or blocked the payment. */
  reasons: string[];
  /** Set when the outcome is "hold". */
  hold: {
    approver: Approver;
    coolingOffUntil: string | null;
    scamSuspected: boolean;
  } | null;
};
