// Decides who a spoken payment goes to. Money must never go to someone the person didn't
// name, so there is no default payee: if Leash can't tell who to pay, the assistant asks.
//
// In order:
//   1. a PayPal email the person said themselves
//   2. the account a caller gave, only when the person explicitly refers to it
//      ("to the PayPal he gave me"); this is how impersonation scams are relayed, and the
//      policy engine then flags the familiar name on a new account
//   3. someone the person has paid before, matched by name

import type { ParsedVoicePayment } from "@/lib/ai/parse-voice";
import { findEmail } from "@/lib/ai/parse-voice";

export type KnownPayee = { payeeId: string; name: string };

export type PayeeResolution =
  | { ok: true; email: string; name: string; source: "spoken_email" | "caller_account" | "known_contact" }
  | { ok: false; message: string };

/** "the PayPal he gave me", "this account", "the email they sent", "his new PayPal"… */
const REFERS_TO_GIVEN_ACCOUNT =
  /\b(?:this|that|the|his|her|their|new)\s+(?:new\s+)?(?:paypal|account|email)\b|\b(?:he|she|they|caller)\s+(?:gave|sent|told|said)\b/i;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const localPart = (email: string) => email.split("@")[0] ?? email;

export function resolvePayee(input: {
  spokenText: string;
  parsed: ParsedVoicePayment;
  callerNote: string | null;
  knownPayees: KnownPayee[];
}): PayeeResolution {
  const { spokenText, parsed, callerNote } = input;
  // Only people with a PayPal email can receive a transfer.
  const contacts = input.knownPayees.filter((p) => p.payeeId.includes("@"));
  const byEmail = (email: string) => contacts.find((p) => p.payeeId === email);

  // 1. An email the person said out loud.
  const spokenEmail = parsed.payeeEmail?.toLowerCase() ?? null;
  if (spokenEmail) {
    return { ok: true, email: spokenEmail, name: parsed.payeeName ?? byEmail(spokenEmail)?.name ?? localPart(spokenEmail), source: "spoken_email" };
  }

  // 2. The caller's account, only when the person points at it.
  const callerEmail = callerNote ? findEmail(callerNote) : null;
  if (callerEmail && REFERS_TO_GIVEN_ACCOUNT.test(spokenText)) {
    return { ok: true, email: callerEmail, name: parsed.payeeName ?? byEmail(callerEmail)?.name ?? localPart(callerEmail), source: "caller_account" };
  }

  // 3. A known contact, by the name the parser found or by a name said anywhere in the request.
  const named = parsed.payeeName?.trim().toLowerCase();
  const matches = named
    ? contacts.filter((p) => p.name.toLowerCase() === named)
    : contacts.filter((p) => new RegExp(`\\b${escapeRegExp(p.name)}\\b`, "i").test(spokenText));
  if (matches.length === 1) return { ok: true, email: matches[0]!.payeeId, name: matches[0]!.name, source: "known_contact" };

  if (parsed.payeeName) {
    return {
      ok: false,
      message: `I don't have a PayPal account for ${parsed.payeeName}. Say the PayPal email they use, and I'll check it before anything is sent.`,
    };
  }
  return { ok: false, message: "I didn't catch who to pay. Say their name, or the PayPal email they gave you." };
}
