// Money is kept as integer cents everywhere inside Leash. PayPal sends and receives
// decimal strings ("12.50"), so conversion happens only at the PayPal boundary.

export type Cents = number;

export function centsToValue(cents: Cents): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`Expected a non-negative integer number of cents, got ${cents}`);
  }
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${dollars}.${rest.toString().padStart(2, "0")}`;
}

/** Parses a PayPal decimal string such as "12.5" or "12.50" into cents, without floating point. */
export function valueToCents(value: string): Cents {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new RangeError(`Not a USD amount: "${value}"`);
  const [, whole, fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatUsd(cents: Cents): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
