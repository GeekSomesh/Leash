import { describe, expect, it } from "vitest";
import { SCAM_CALL_TRANSCRIPT } from "@/lib/demo/fixtures";
import { parseVoiceFallback } from "@/lib/ai/parse-voice";
import { resolvePayee, type KnownPayee } from "./resolve-payee";

const known: KnownPayee[] = [
  { payeeId: "arjun.shah@example.com", name: "Arjun" },
  { payeeId: "freshcart", name: "FreshCart Groceries" }, // a merchant: can't receive a transfer
];

const resolve = (spokenText: string, callerNote: string | null = null) =>
  resolvePayee({ spokenText, parsed: parseVoiceFallback(spokenText), callerNote, knownPayees: known });

describe("resolvePayee", () => {
  it("pays a known contact by name", () => {
    expect(resolve("send two thousand dollars to Arjun")).toEqual({ ok: true, email: "arjun.shah@example.com", name: "Arjun", source: "known_contact" });
  });

  it("matches a known contact even when speech recognition lowercases the name", () => {
    expect(resolve("send fifty dollars to arjun")).toMatchObject({ ok: true, email: "arjun.shah@example.com", source: "known_contact" });
  });

  it("uses an email the person said themselves", () => {
    expect(resolve("Send $50 to Arjun at arjun.new@example.com")).toEqual({ ok: true, email: "arjun.new@example.com", name: "Arjun", source: "spoken_email" });
  });

  it("uses the caller's account only when the person refers to it (the scam demo)", () => {
    const result = resolve("Send two thousand dollars to Arjun, to the PayPal he gave me", SCAM_CALL_TRANSCRIPT);
    expect(result).toEqual({ ok: true, email: "arjun.bail.help@example.com", name: "Arjun", source: "caller_account" });
  });

  it("never takes the caller's account when the person just names a known contact", () => {
    expect(resolve("send two thousand dollars to Arjun", SCAM_CALL_TRANSCRIPT)).toMatchObject({ email: "arjun.shah@example.com", source: "known_contact" });
  });

  it("asks instead of guessing when the payee is unknown", () => {
    const result = resolve("send two thousand dollars to Maya");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Maya");
  });

  it("asks when no payee was said at all, and never defaults to anyone", () => {
    expect(resolve("pay twenty five hundred to the plumber")).toEqual({ ok: false, message: "I didn't catch who to pay. Say their name, or the PayPal email they gave you." });
  });

  it("ignores merchants, which can't receive a transfer", () => {
    expect(resolve("send ten dollars to FreshCart Groceries").ok).toBe(false);
  });
});
