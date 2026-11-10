// Fixed-pattern detectors that need no model: hidden instructions aimed at AI agents
// (prompt injection), the language of scams aimed at people, and cash-like items.
//
// They run on every payment, with or without Claude. Claude's checks catch what patterns
// miss; these make sure the obvious cases are caught even when the model is unavailable.

import type { Category, Evidence, PaymentRequest } from "@/lib/domain/schemas";

export type Severity = "none" | "low" | "medium" | "high";

export type InjectionFinding = {
  severity: Severity;
  /** Sentences that try to instruct the agent, for highlighting. */
  quotes: string[];
  /** Which patterns fired, in plain words. */
  signals: string[];
};

export type ScamSignal = {
  kind: "urgency" | "secrecy" | "emergency_story" | "untraceable_payment" | "authority_impersonation" | "family_impersonation" | "new_payment_details";
  label: string;
  quote: string;
};

export type ScamFinding = {
  severity: Severity;
  signals: ScamSignal[];
};

// --- Prompt injection ------------------------------------------------------------------

const STRONG_INJECTION: { label: string; pattern: RegExp }[] = [
  {
    label: "tells the agent to ignore its instructions",
    pattern: /\b(ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(instructions?|directions|rules|prompts?|guidelines)\b/i,
  },
  { label: "addresses the AI agent directly", pattern: /\b(ai|llm|gpt|claude)\s+(assistant|agent|model|bot|shopper)s?\b\s*[:,—-]/i },
  {
    label: "claims the buyer already approved it",
    pattern: /\b(user|buyer|customer|owner|account holder)\b[^.!?\n]{0,20}\b(pre-?approved|already approved|authori[sz]ed|confirmed)\b/i,
  },
  {
    label: "asks the agent to hide something from the person",
    pattern: /\b(do not|don't|never)\s+(tell|mention|inform|notify|alert|show)\b[^.!?\n]{0,30}\b(user|buyer|owner|customer|human|anyone)\b/i,
  },
  { label: "tries to give the agent new instructions", pattern: /\b(new instructions?|system prompt|developer message|you are now)\b|<\/?\s*system\s*>/i },
];

const HIDDEN_TEXT: { label: string; pattern: RegExp }[] = [
  { label: "uses hidden text styling", pattern: /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*[01](\.\d+)?\s*(px|pt)?\b|opacity\s*:\s*0(\.0+)?\b)/i },
  { label: "uses white-on-white text", pattern: /color\s*:\s*(#fff\b|#ffffff\b|white\b)/i },
  { label: "contains invisible characters", pattern: /[​-‍⁠﻿]/ },
  { label: "hides instructions in an HTML comment", pattern: /<!--[\s\S]{0,400}?\b(buy|purchase|pay|ignore|assistant|agent)\b[\s\S]{0,400}?-->/i },
];

/** Only content from outside (web pages, emails, messages) can carry an injection; the owner's own words can't. */
const UNTRUSTED_SOURCES: ReadonlySet<Evidence["source"]> = new Set(["web_page", "email", "chat_message", "other"]);

export function detectInjection(request: PaymentRequest): InjectionFinding {
  const quotes = new Set<string>();
  const signals = new Set<string>();
  let strong = 0;
  let hidden = 0;

  for (const evidence of request.evidence) {
    if (!UNTRUSTED_SOURCES.has(evidence.source)) continue;
    const text = evidence.content;
    for (const { label, pattern } of STRONG_INJECTION) {
      const match = pattern.exec(text);
      if (match) {
        strong++;
        signals.add(label);
        quotes.add(sentenceAround(stripTags(text), stripTags(match[0])));
      }
    }
    for (const { label, pattern } of HIDDEN_TEXT) {
      if (pattern.test(text)) {
        hidden++;
        signals.add(label);
      }
    }
  }

  const severity: Severity = strong >= 2 || (strong >= 1 && hidden >= 1) ? "high" : strong === 1 ? "medium" : hidden > 0 ? "low" : "none";
  return { severity, quotes: [...quotes], signals: [...signals] };
}

// --- Scams aimed at people -----------------------------------------------------------------

const SCAM_PATTERNS: { kind: ScamSignal["kind"]; label: string; pattern: RegExp }[] = [
  {
    kind: "urgency",
    label: "pressure to act right now",
    pattern: /\b(right now|immediately|urgent(ly)?|asap|hurry|before it'?s too late|today or|only (have|giving me) one call|within the hour)\b/i,
  },
  {
    kind: "secrecy",
    label: "asks to keep it secret",
    pattern: /\b((don'?t|do not) (tell|let) (anyone|nobody|mom|mum|dad|priya|my (mom|mum|dad|parents)|your (son|daughter|family|wife|husband))|keep (this|it) (between us|secret|quiet)|our (little )?secret)\b/i,
  },
  {
    kind: "emergency_story",
    label: "an emergency story (arrest, bail, accident)",
    pattern: /\b(arrested|in jail|bail|lawyer|attorney|police station|car accident|in the hospital|kidnapp\w*|ransom|stranded)\b/i,
  },
  {
    kind: "untraceable_payment",
    label: "asks for gift cards, crypto or a wire",
    pattern: /\b(gift ?cards?|itunes cards?|google play cards?|steam cards?|bitcoin|crypto(currency)?|usdt|wire (transfer|the money)|western union|moneygram)\b/i,
  },
  {
    kind: "authority_impersonation",
    label: "claims to be an official or a company",
    pattern: /\b(irs|tax office|social security|medicare|bank'?s? (security|fraud) (team|department)|fraud department|tech support|microsoft support|amazon (support|refund))\b/i,
  },
  {
    kind: "family_impersonation",
    label: "a relative who sounds unfamiliar",
    pattern: /\b(grandpa|grandma|granddad|grandmother|grandfather|nana|nani|dadi)\b[^.!?\n]{0,30}\b(it'?s me|this is)\b/i,
  },
  {
    kind: "new_payment_details",
    label: "new payment details",
    pattern: /\b(send|pay|transfer)\b[^.!?\n]{0,40}\bto this (new )?(paypal|account|number|email|address)\b/i,
  },
];

/** Where scam language shows up: what the person said, heard or was sent, and the agent's own reason. */
const HUMAN_SOURCES: ReadonlySet<Evidence["source"]> = new Set(["voice_transcript", "chat_message", "email", "other"]);

export function detectScam(request: PaymentRequest): ScamFinding {
  // What people said or were sent comes first, so quotes show their words. The agent's own
  // justification only counts for transfers, where it relays what the person asked for.
  const texts = [
    ...request.evidence.filter((e) => HUMAN_SOURCES.has(e.source)).map((e) => e.content),
    ...(request.kind === "transfer" ? [request.justification] : []),
  ];
  const byKind = new Map<ScamSignal["kind"], ScamSignal>();
  for (const text of texts) {
    for (const { kind, label, pattern } of SCAM_PATTERNS) {
      if (byKind.has(kind)) continue;
      const match = pattern.exec(text);
      if (match) byKind.set(kind, { kind, label, quote: sentenceAround(text, match[0]) });
    }
  }
  const signals = [...byKind.values()];
  const severity: Severity = signals.length >= 3 ? "high" : signals.length === 2 ? "medium" : signals.length === 1 ? "low" : "none";
  return { severity, signals };
}

// --- Cash-like items --------------------------------------------------------------------

const ITEM_PATTERNS: { category: Category; pattern: RegExp }[] = [
  { category: "gift_cards", pattern: /\b(gift ?cards?|e-?gift|gift vouchers?|gift codes?|store credit codes?)\b/i },
  { category: "prepaid_cards", pattern: /\b(prepaid (visa|mastercard|debit|card)s?|reloadable cards?)\b/i },
  { category: "crypto", pattern: /\b(bitcoin|btc|ethereum|eth|usdt|crypto(currency)?|nft)\b/i },
  { category: "money_transfer", pattern: /\b(wire transfer|money order|western union|moneygram)\b/i },
  { category: "alcohol", pattern: /\b(wine|beer|vodka|whiske?y|liquor|champagne|tequila|rum|gin)\b/i },
  { category: "tobacco_vaping", pattern: /\b(vapes?|cigarettes?|cigars?|nicotine|e-liquid)\b/i },
  { category: "gambling", pattern: /\b(casino|betting|lottery|sportsbook|poker chips)\b/i },
];

/** Extra categories per line item, from its name and description. */
export function labelItems(request: PaymentRequest): Category[][] {
  return request.items.map((item) => {
    const text = `${item.name} ${item.description ?? ""}`;
    return ITEM_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
  });
}

// --- Helpers -------------------------------------------------------------------------------

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** The sentence that contains `fragment`, trimmed to a readable length. */
function sentenceAround(text: string, fragment: string): string {
  const index = text.indexOf(fragment);
  if (index < 0) return fragment.trim();
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "), before.lastIndexOf("\n")) + 1;
  const afterIndex = text.slice(index + fragment.length).search(/[.!?](\s|$)/);
  const end = afterIndex < 0 ? text.length : index + fragment.length + afterIndex + 1;
  const sentence = text.slice(start, end).trim();
  return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
}
