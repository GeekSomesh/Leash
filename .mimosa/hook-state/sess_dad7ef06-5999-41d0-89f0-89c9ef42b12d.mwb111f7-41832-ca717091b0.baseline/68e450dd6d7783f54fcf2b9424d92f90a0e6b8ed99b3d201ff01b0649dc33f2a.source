import { describe, expect, it } from "vitest";
import { AiUnavailableError } from "@/lib/ai/openrouter";
import type { Review } from "@/lib/ai/review";
import type { Mandate, Policy } from "@/lib/domain/schemas";
import {
  giftAgentPolicy,
  giftMandate as demoGiftMandate,
  injectedGiftCardPurchase,
  scamTransfer,
  telescopePurchase,
  voiceAssistantPolicy,
} from "@/lib/demo/fixtures";
import { decide, type DecideInput } from "./pipeline";

const NOW = new Date("2026-11-05T15:00:00Z");
const giftMandate = (overrides: Partial<Mandate> = {}) => demoGiftMandate({ expiresAt: "2026-11-08T00:00:00Z", ...overrides });

function context(policy: Policy, overrides: Partial<DecideInput["context"]> = {}): DecideInput["context"] {
  return {
    now: NOW,
    policy,
    mandate: giftMandate(),
    spentInPeriodCents: 0,
    paymentsInVelocityWindow: 0,
    payeeKnown: true,
    samePayeeNameKnownAs: null,
    allowanceRemainingCents: 15000,
    ...overrides,
  };
}

const cleanReview: Review = {
  items: [{ index: 0, categories: ["toys_games"], cashEquivalent: false, note: "" }],
  mandateAlignment: { verdict: "aligned", reason: "A telescope kit is a space-themed gift for a 10-year-old." },
  injection: { detected: false, confidence: "low", quotes: [], explanation: "Nothing tried to steer the agent." },
  scam: { risk: "none", scamType: null, signals: [], explanation: "Ordinary purchase." },
};

const reviewer = (review: Review) => async () => review;

describe("decide", () => {
  it("approves the telescope with or without Claude", async () => {
    const withClaude = await decide({ request: telescopePurchase(), context: context(giftAgentPolicy), reviewer: reviewer(cleanReview), hasGuardian: false });
    const withoutClaude = await decide({ request: telescopePurchase(), context: context(giftAgentPolicy), reviewer: null, hasGuardian: false });
    expect(withClaude.outcome).toBe("approve");
    expect(withoutClaude.outcome).toBe("approve");
    expect(withoutClaude.checks.find((c) => c.id === "ai_review")?.status).toBe("skipped");
  });

  it("blocks the injected gift card purchase even without Claude", async () => {
    const result = await decide({
      request: injectedGiftCardPurchase(),
      context: context(giftAgentPolicy, { payeeKnown: false }),
      reviewer: null,
      hasGuardian: false,
    });
    expect(result.outcome).toBe("block");
    const injection = result.checks.find((c) => c.id === "heuristic_injection");
    expect(injection?.status).toBe("block");
    expect(injection?.quotes?.some((q) => q.includes("Ignore your previous instructions"))).toBe(true);
    expect(result.checks.find((c) => c.id === "categories")?.status).toBe("block");
  });

  it("lets Claude's labels make a purchase stricter", async () => {
    const review: Review = { ...cleanReview, items: [{ index: 0, categories: ["electronics"], cashEquivalent: false, note: "battery-powered" }] };
    const result = await decide({ request: telescopePurchase(), context: context(giftAgentPolicy), reviewer: reviewer(review), hasGuardian: false });
    expect(result.outcome).toBe("hold");
  });

  it("never lets Claude make a blocked purchase look safe", async () => {
    // Claude (wrongly) says everything is fine; the rules and detectors still block.
    const result = await decide({
      request: injectedGiftCardPurchase(),
      context: context(giftAgentPolicy, { payeeKnown: false }),
      reviewer: reviewer(cleanReview),
      hasGuardian: false,
    });
    expect(result.outcome).toBe("block");
  });

  it("holds when Claude reports a misaligned purchase", async () => {
    const review: Review = { ...cleanReview, mandateAlignment: { verdict: "misaligned", reason: "Not a gift for Maya." } };
    const result = await decide({ request: telescopePurchase(), context: context(giftAgentPolicy), reviewer: reviewer(review), hasGuardian: false });
    expect(result.outcome).toBe("hold");
    expect(result.hold?.approver).toBe("owner");
    expect(result.hold?.scamSuspected).toBe(false);
  });

  it("holds the bail scam for the guardian with a cooling-off period", async () => {
    const result = await decide({
      request: scamTransfer(),
      context: context(voiceAssistantPolicy, { mandate: null, payeeKnown: false, allowanceRemainingCents: null }),
      reviewer: null,
      hasGuardian: true,
    });
    expect(result.outcome).toBe("hold");
    expect(result.hold?.scamSuspected).toBe(true);
    expect(result.hold?.approver).toBe("guardian");
    expect(result.hold?.coolingOffUntil).toBe("2026-11-05T15:30:00.000Z");
  });

  it("fails closed: if the AI review is configured but can't answer, a person checks", async () => {
    const failing = async () => {
      throw new AiUnavailableError("timeout");
    };
    const result = await decide({ request: telescopePurchase(), context: context(giftAgentPolicy), reviewer: failing, hasGuardian: false });
    expect(result.outcome).toBe("hold");
    expect(result.checks.find((c) => c.id === "ai_review")?.status).toBe("hold");
  });

  it("explains every hold and block in its reasons", async () => {
    const result = await decide({
      request: injectedGiftCardPurchase(),
      context: context(giftAgentPolicy, { payeeKnown: false }),
      reviewer: null,
      hasGuardian: false,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toMatch(/like cash|instructions/);
  });
});
