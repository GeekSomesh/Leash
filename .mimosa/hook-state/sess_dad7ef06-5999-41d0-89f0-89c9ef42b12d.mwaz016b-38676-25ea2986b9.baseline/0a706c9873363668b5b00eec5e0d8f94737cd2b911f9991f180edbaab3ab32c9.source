import { describe, expect, it } from "vitest";
import { parseVoiceFallback, parseVoicePayment } from "./parse-voice";

describe("parseVoiceFallback", () => {
  it.each([
    ["send $2,000 to Arjun", 200000, "Arjun"],
    ["send two thousand dollars to Arjun", 200000, "Arjun"],
    ["send $2,000 to Arjun. He needs bail money.", 200000, "Arjun"],
    ["pay twenty five hundred to the plumber", 250000, null],
    ["send fifteen hundred dollars to Maya", 150000, "Maya"],
    ["one thousand two hundred dollars for the rent", 120000, null],
    ["pay 2000 dollars for electricity", 200000, null],
    ["send $1,500.50 to Ramesh", 150050, "Ramesh"],
    ["I want to pay my nephew two thousand five hundred dollars", 250000, null],
  ])("parses %s", (text, amountCents, payeeName) => {
    expect(parseVoiceFallback(text)).toEqual({ amountCents, payeeName, payeeEmail: null });
  });

  it("finds a PayPal email and does not mistake it for a name", () => {
    const parsed = parseVoiceFallback("Send it today to this PayPal: arjun.bail.help@example.com, please hurry.");
    expect(parsed.payeeEmail).toBe("arjun.bail.help@example.com");
    expect(parsed.payeeName).toBeNull();
    expect(parsed.amountCents).toBeNull();
  });

  it("keeps a spoken name when an email is also present", () => {
    const parsed = parseVoiceFallback("Send $50 to Arjun at arjun.shah@example.com");
    expect(parsed.payeeName).toBe("Arjun");
    expect(parsed.payeeEmail).toBe("arjun.shah@example.com");
  });

  it("returns nulls when nothing matches", () => {
    expect(parseVoiceFallback("hello there")).toEqual({ amountCents: null, payeeName: null, payeeEmail: null });
  });
});

describe("parseVoicePayment", () => {
  // Tests must never need the network, so the pattern fallback runs even if a key is set.
  it("uses the pattern fallback when the AI is off", async () => {
    const parsed = await parseVoicePayment("send two thousand dollars to Arjun", { useAi: false });
    expect(parsed.amountCents).toBe(200000);
    expect(parsed.payeeName).toBe("Arjun");
  });
});
