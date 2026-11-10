// Resets the database to the demo world (see lib/demo/fixtures.ts).

import type { Db } from "@/lib/db/client";
import {
  agents,
  allowances,
  approvals,
  guardianships,
  knownPayees,
  ledger,
  mandates,
  paymentRequests,
  people,
} from "@/lib/db/schema";
import { paypalConfigured } from "@/lib/paypal/client";
import { hashToken, newAgentToken, newId } from "@/lib/payments/ids";
import { requestAllowance, type ServiceOptions } from "@/lib/payments/service";
import {
  MERCHANTS,
  POLICY_SOURCES,
  giftAgentPolicy,
  groceryAgentPolicy,
  voiceAssistantPolicy,
} from "./fixtures";

export const DEMO_IDS = {
  priya: "person-priya",
  ramesh: "person-ramesh",
  arjun: "person-arjun",
  groceryAgent: "agent-grocery",
  giftAgent: "agent-gift",
  voiceAssistant: "agent-voice",
  groceryMandate: "mandate-weekly-groceries",
  giftMandate: "mandate-gift-maya",
} as const;

export const arjunEmail = () => process.env.DEMO_PERSON_ARJUN_EMAIL || "arjun.shah@example.com";

export type SeedResult = {
  /** MCP bearer tokens, by agent id. Shown once; only hashes are stored. */
  tokens: Record<string, string>;
  allowanceId: string | null;
};

export async function resetDemo(db: Db, options: ServiceOptions = {}): Promise<SeedResult> {
  const now = options.now ?? new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  for (const table of [approvals, ledger, paymentRequests, mandates, knownPayees, allowances, agents, guardianships, people]) {
    await db.delete(table);
  }

  await db.insert(people).values([
    { id: DEMO_IDS.priya, name: "Priya", paypalEmail: null, language: "English" },
    { id: DEMO_IDS.ramesh, name: "Ramesh", paypalEmail: null, language: "English" },
    { id: DEMO_IDS.arjun, name: "Arjun", paypalEmail: arjunEmail(), language: "English" },
  ]);
  await db.insert(guardianships).values({ id: newId("grd"), personId: DEMO_IDS.ramesh, guardianId: DEMO_IDS.priya });

  const tokens: Record<string, string> = {
    [DEMO_IDS.groceryAgent]: newAgentToken(),
    [DEMO_IDS.giftAgent]: newAgentToken(),
    [DEMO_IDS.voiceAssistant]: newAgentToken(),
  };
  await db.insert(agents).values([
    {
      id: DEMO_IDS.groceryAgent,
      ownerId: DEMO_IDS.priya,
      name: "Grocery agent",
      kind: "shopping",
      tokenHash: hashToken(tokens[DEMO_IDS.groceryAgent]!),
      policy: groceryAgentPolicy,
      policySource: POLICY_SOURCES.grocery,
    },
    {
      id: DEMO_IDS.giftAgent,
      ownerId: DEMO_IDS.priya,
      name: "Gift agent",
      kind: "shopping",
      tokenHash: hashToken(tokens[DEMO_IDS.giftAgent]!),
      policy: giftAgentPolicy,
      policySource: POLICY_SOURCES.gift,
    },
    {
      id: DEMO_IDS.voiceAssistant,
      ownerId: DEMO_IDS.ramesh,
      name: "Ramesh's voice assistant",
      kind: "voice_assistant",
      tokenHash: hashToken(tokens[DEMO_IDS.voiceAssistant]!),
      policy: voiceAssistantPolicy,
      policySource: POLICY_SOURCES.voice,
    },
  ]);

  await db.insert(mandates).values([
    {
      id: DEMO_IDS.groceryMandate,
      agentId: DEMO_IDS.groceryAgent,
      purpose: "This week's groceries from the usual list",
      maxTotalCents: 15000,
      categories: ["groceries", "household"],
      merchants: null,
      expiresAt: days(7),
    },
    {
      id: DEMO_IDS.giftMandate,
      agentId: DEMO_IDS.giftAgent,
      purpose: "Space-themed birthday gift for Maya, who is turning 10",
      maxTotalCents: 4000,
      categories: ["toys_games", "books_media"],
      merchants: null,
      expiresAt: days(3),
    },
  ]);

  // Payees the family has paid before. The "Arjun" in the scam asks for a different account.
  await db.insert(knownPayees).values([
    { id: newId("pye"), ownerId: DEMO_IDS.priya, payeeId: MERCHANTS.freshCart.id, name: MERCHANTS.freshCart.name },
    { id: newId("pye"), ownerId: DEMO_IDS.priya, payeeId: MERCHANTS.orbitToys.id, name: MERCHANTS.orbitToys.name },
    { id: newId("pye"), ownerId: DEMO_IDS.ramesh, payeeId: arjunEmail().toLowerCase(), name: "Arjun" },
  ]);

  // Without PayPal keys, start with a simulated allowance so the demo works out of the box.
  // With keys, the owner approves a real sandbox allowance from the console.
  let allowanceId: string | null = null;
  if (options.simulatePayPal || !paypalConfigured()) {
    allowanceId = (await requestAllowance(db, { ownerId: DEMO_IDS.priya, amountCents: 15000, days: 7 }, { ...options, simulatePayPal: true })).id;
  }
  return { tokens, allowanceId };
}
