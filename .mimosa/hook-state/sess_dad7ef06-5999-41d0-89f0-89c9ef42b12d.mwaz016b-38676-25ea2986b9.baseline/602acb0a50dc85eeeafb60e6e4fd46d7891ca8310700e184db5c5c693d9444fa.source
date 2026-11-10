import { describe, expect, it } from "vitest";
import type { Category, Mandate, PaymentRequest, Policy } from "@/lib/domain/schemas";
import {
  giftAgentPolicy,
  giftMandate as demoGiftMandate,
  groceryAgentPolicy,
  groceryOrder,
  injectedGiftCardPurchase,
  scamTransfer,
  telescopePurchase,
  voiceAssistantPolicy,
} from "@/lib/demo/fixtures";
import { evaluatePolicy, type PolicyContext } from "./evaluate";
import { describePolicy } from "./describe";

const NOW = new Date("2026-11-05T15:00:00Z");

// Tests run at a fixed time, so mandates expire relative to it rather than to the real clock.
const giftMandate = (overrides: Partial<Mandate> = {}) => demoGiftMandate({ expiresAt: "2026-11-08T00:00:00Z", ...overrides });

function ctx(policy: Policy, overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    now: NOW,
    policy,
    mandate: null,
    spentInPeriodCents: 0,
    paymentsInVelocityWindow: 0,
    payeeKnown: true,
    samePayeeNameKnownAs: null,
    allowanceRemainingCents: 15000,
    itemLabels: [],
    ...overrides,
  };
}

const groceryMandate = giftMandate({
  id: "mandate-weekly-groceries",
  agentId: "agent-grocery",
  purpose: "This week's groceries",
  maxTotalCents: 15000,
  categories: ["groceries", "household"],
});

const statusOf = (result: ReturnType<typeof evaluatePolicy>, id: string) => result.checks.find((c) => c.id === id)?.status;

describe("evaluatePolicy: the demo scenes", () => {
  it("approves a normal grocery order inside every limit", () => {
    const result = evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: groceryMandate }));
    expect(result.outcome).toBe("approve");
    expect(result.checks.every((c) => c.status === "pass" || c.status === "skipped")).toBe(true);
  });

  it("approves the telescope gift inside the task", () => {
    const result = evaluatePolicy(telescopePurchase(), ctx(giftAgentPolicy, { mandate: giftMandate() }));
    expect(result.outcome).toBe("approve");
  });

  it("blocks the injected gift card purchase once the item is labelled a gift card", () => {
    const result = evaluatePolicy(
      injectedGiftCardPurchase(),
      ctx(giftAgentPolicy, { mandate: giftMandate(), payeeKnown: false, itemLabels: [["gift_cards"]] }),
    );
    expect(result.outcome).toBe("block");
    expect(statusOf(result, "categories")).toBe("block");
    expect(statusOf(result, "new_payee")).toBe("hold");
    expect(statusOf(result, "mandate")).toBe("hold");
  });

  it("flags a familiar name on a new account", () => {
    const result = evaluatePolicy(
      scamTransfer(),
      ctx(voiceAssistantPolicy, { payeeKnown: false, samePayeeNameKnownAs: "arjun.shah@example.com", allowanceRemainingCents: null }),
    );
    expect(statusOf(result, "payee_changed")).toBe("hold");
    expect(result.checks.find((c) => c.id === "payee_changed")?.detail).toContain("arjun.shah@example.com");
  });

  it("holds (not blocks) the $2,000 transfer to a new payee, so a guardian decides", () => {
    const result = evaluatePolicy(scamTransfer(), ctx(voiceAssistantPolicy, { payeeKnown: false, allowanceRemainingCents: null }));
    expect(result.outcome).toBe("hold");
    expect(statusOf(result, "new_payee")).toBe("hold");
    expect(statusOf(result, "transfer")).toBe("hold");
    expect(statusOf(result, "allowance")).toBe("skipped");
  });
});

describe("evaluatePolicy: amounts", () => {
  it("blocks when the items don't add up to the total", () => {
    const request = { ...groceryOrder(), totalCents: 9999 };
    const result = evaluatePolicy(request, ctx(groceryAgentPolicy, { mandate: groceryMandate }));
    expect(statusOf(result, "totals")).toBe("block");
    expect(result.outcome).toBe("block");
  });

  it("blocks a $0 payment", () => {
    const request: PaymentRequest = { ...scamTransfer(), totalCents: 0 };
    expect(evaluatePolicy(request, ctx(voiceAssistantPolicy)).outcome).toBe("block");
  });

  it("blocks a purchase with no line items", () => {
    const request: PaymentRequest = { ...groceryOrder(), items: [], totalCents: 100, shippingCents: 0, taxCents: 0 };
    expect(statusOf(evaluatePolicy(request, ctx(groceryAgentPolicy, { mandate: groceryMandate })), "totals")).toBe("block");
  });

  it("blocks above the per-payment maximum and holds above the ask threshold", () => {
    const one = (cents: number): PaymentRequest => ({
      ...groceryOrder(),
      items: [{ name: "Bulk rice", description: null, quantity: 1, unitPriceCents: cents, url: null, declaredCategory: "groceries" }],
      shippingCents: 0,
      taxCents: 0,
      totalCents: cents,
    });
    const run = (cents: number) => evaluatePolicy(one(cents), ctx(groceryAgentPolicy, { mandate: groceryMandate })).outcome;
    expect(run(5000)).toBe("approve");
    expect(run(7000)).toBe("hold");
    expect(run(9000)).toBe("block");
  });
});

describe("evaluatePolicy: budget and allowance", () => {
  it("blocks when the rolling budget would be exceeded", () => {
    const result = evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: groceryMandate, spentInPeriodCents: 14000 }));
    expect(statusOf(result, "budget")).toBe("block");
  });

  it("blocks a purchase when no PayPal allowance is held", () => {
    const result = evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: groceryMandate, allowanceRemainingCents: null }));
    expect(statusOf(result, "allowance")).toBe("block");
  });

  it("blocks a purchase bigger than what's left of the allowance", () => {
    const result = evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: groceryMandate, allowanceRemainingCents: 1000 }));
    expect(statusOf(result, "allowance")).toBe("block");
  });
});

describe("evaluatePolicy: mandates", () => {
  it("holds a purchase with no task when the policy requires one", () => {
    const request = { ...groceryOrder(), mandateId: null };
    const result = evaluatePolicy(request, ctx(groceryAgentPolicy));
    expect(statusOf(result, "mandate")).toBe("hold");
  });

  it("blocks a purchase citing a task that doesn't exist", () => {
    expect(statusOf(evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: null })), "mandate")).toBe("block");
  });

  it("blocks when the task has expired or was revoked", () => {
    const expired = giftMandate({ expiresAt: "2026-11-01T00:00:00Z" });
    const revoked = giftMandate({ status: "revoked" });
    expect(statusOf(evaluatePolicy(telescopePurchase(), ctx(giftAgentPolicy, { mandate: expired })), "mandate")).toBe("block");
    expect(statusOf(evaluatePolicy(telescopePurchase(), ctx(giftAgentPolicy, { mandate: revoked })), "mandate")).toBe("block");
  });

  it("blocks when the task's own budget would be exceeded", () => {
    const mostlySpent = giftMandate({ spentCents: 2000 });
    expect(statusOf(evaluatePolicy(telescopePurchase(), ctx(giftAgentPolicy, { mandate: mostlySpent })), "mandate")).toBe("block");
  });

  it("holds an item outside the task's categories", () => {
    const request = telescopePurchase();
    const result = evaluatePolicy(request, ctx(giftAgentPolicy, { mandate: giftMandate(), itemLabels: [["electronics"]] }));
    expect(statusOf(result, "mandate")).toBe("hold");
  });
});

describe("evaluatePolicy: categories and payees", () => {
  const withCategory = (category: Category) => ctx(giftAgentPolicy, { mandate: giftMandate({ categories: null }), itemLabels: [[category]] });

  it("blocks never-allowed categories", () => {
    expect(statusOf(evaluatePolicy(telescopePurchase(), withCategory("alcohol")), "categories")).toBe("block");
  });

  it("blocks cash equivalents like crypto", () => {
    expect(statusOf(evaluatePolicy(telescopePurchase(), withCategory("crypto")), "categories")).toBe("block");
  });

  it("holds ask-first categories", () => {
    expect(statusOf(evaluatePolicy(telescopePurchase(), withCategory("electronics")), "categories")).toBe("hold");
  });

  it("holds categories outside an allow-list", () => {
    const request: PaymentRequest = {
      ...groceryOrder(),
      items: [{ name: "Board game", description: null, quantity: 1, unitPriceCents: 2500, url: null, declaredCategory: "toys_games" }],
      shippingCents: 0,
      taxCents: 0,
      totalCents: 2500,
    };
    const result = evaluatePolicy(request, ctx(groceryAgentPolicy, { mandate: { ...groceryMandate, categories: null } }));
    expect(statusOf(result, "categories")).toBe("hold");
  });

  it("falls back to the merchant's declared categories when items have none", () => {
    const request = telescopePurchase();
    request.items[0]!.declaredCategory = null;
    const result = evaluatePolicy(request, ctx(giftAgentPolicy, { mandate: giftMandate() }));
    expect(statusOf(result, "categories")).toBe("pass");
    expect(result.outcome).toBe("approve");
  });

  it("blocks a blocked merchant by id or name", () => {
    const policy: Policy = { ...giftAgentPolicy, merchants: { blocked: ["orbit toys"], allowedOnly: null } };
    expect(statusOf(evaluatePolicy(telescopePurchase(), ctx(policy, { mandate: giftMandate() })), "merchant")).toBe("block");
  });

  it("holds the first payment to a new payee when the policy asks", () => {
    const result = evaluatePolicy(telescopePurchase(), ctx(giftAgentPolicy, { mandate: giftMandate(), payeeKnown: false }));
    expect(statusOf(result, "new_payee")).toBe("hold");
    expect(result.outcome).toBe("hold");
  });

  it("blocks transfers for agents that may not send money to people", () => {
    const result = evaluatePolicy(scamTransfer(), ctx(giftAgentPolicy, { allowanceRemainingCents: null }));
    expect(statusOf(result, "transfer")).toBe("block");
  });
});

describe("evaluatePolicy: pace and time", () => {
  it("holds the payment that goes over the velocity limit", () => {
    const result = evaluatePolicy(groceryOrder(), ctx(groceryAgentPolicy, { mandate: groceryMandate, paymentsInVelocityWindow: 5 }));
    expect(statusOf(result, "velocity")).toBe("hold");
  });

  it("holds payments inside overnight quiet hours in the policy's time zone", () => {
    const policy: Policy = { ...groceryAgentPolicy, quietHours: { startHour: 22, endHour: 7, timezone: "America/New_York" } };
    const lateNight = new Date("2026-11-06T04:30:00Z"); // 23:30 in New York
    const afternoon = new Date("2026-11-05T19:00:00Z"); // 14:00 in New York
    expect(statusOf(evaluatePolicy(groceryOrder(), ctx(policy, { mandate: groceryMandate, now: lateNight })), "quiet_hours")).toBe("hold");
    expect(statusOf(evaluatePolicy(groceryOrder(), ctx(policy, { mandate: groceryMandate, now: afternoon })), "quiet_hours")).toBe("pass");
  });
});

describe("describePolicy", () => {
  it("reads the voice assistant policy back in plain English", () => {
    const text = describePolicy(voiceAssistantPolicy).join("\n");
    expect(text).toContain("Spend up to $3,000.00 in any 30 days.");
    expect(text).toContain("anything over $200.00 needs approval");
    expect(text).toContain("Held payments are approved by the guardian.");
    expect(text).toContain("waits 30 minutes");
  });

  it("mentions allow-lists and blocked categories", () => {
    const text = describePolicy(groceryAgentPolicy).join("\n");
    expect(text).toContain("Without asking, only: groceries, household supplies.");
    expect(text).toContain("Never buy: alcohol, tobacco and vaping, gambling, weapons, adult content.");
    expect(text).toContain("Every purchase must belong to a task the owner gave the agent.");
  });
});
