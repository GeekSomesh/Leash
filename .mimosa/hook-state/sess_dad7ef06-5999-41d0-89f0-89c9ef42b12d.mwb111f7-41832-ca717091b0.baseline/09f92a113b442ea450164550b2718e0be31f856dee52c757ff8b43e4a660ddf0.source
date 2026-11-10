// The Judge Mode scenarios: each sends one of the demo payment requests through the full
// Leash pipeline as the agent that would make it, exactly as an agent would over MCP.

import type { Db } from "@/lib/db/client";
import type { PaymentRequest } from "@/lib/domain/schemas";
import { agentOrThrow, submitPayment, type ServiceOptions } from "@/lib/payments/service";
import type { PaymentRow } from "@/lib/payments/queries";
import { groceryOrder, injectedGiftCardPurchase, scamTransfer, telescopePurchase } from "./fixtures";
import type { ScenarioName } from "./scenario-info";
import { DEMO_IDS } from "./seed";

export type { ScenarioName } from "./scenario-info";

const SCENARIOS: Record<ScenarioName, { agentId: string; build: () => PaymentRequest }> = {
  groceries: { agentId: DEMO_IDS.groceryAgent, build: () => groceryOrder(DEMO_IDS.groceryMandate) },
  telescope: { agentId: DEMO_IDS.giftAgent, build: () => telescopePurchase(DEMO_IDS.giftMandate) },
  injection: { agentId: DEMO_IDS.giftAgent, build: () => injectedGiftCardPurchase(DEMO_IDS.giftMandate) },
  scam: { agentId: DEMO_IDS.voiceAssistant, build: () => scamTransfer() },
};

export function isScenarioName(name: string): name is ScenarioName {
  return name in SCENARIOS;
}

export async function runScenario(db: Db, name: ScenarioName, options: ServiceOptions = {}): Promise<PaymentRow> {
  const scenario = SCENARIOS[name];
  const agent = await agentOrThrow(db, scenario.agentId);
  return submitPayment(db, agent, scenario.build(), options);
}
