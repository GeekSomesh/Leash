import { describe, expect, it } from "vitest";
import { centsToValue, formatUsd, valueToCents } from "./money";

describe("money", () => {
  it("converts cents to PayPal decimal strings", () => {
    expect(centsToValue(0)).toBe("0.00");
    expect(centsToValue(5)).toBe("0.05");
    expect(centsToValue(3499)).toBe("34.99");
    expect(centsToValue(200000)).toBe("2000.00");
  });

  it("parses PayPal decimal strings without floating point", () => {
    expect(valueToCents("34.99")).toBe(3499);
    expect(valueToCents("12.5")).toBe(1250);
    expect(valueToCents("7")).toBe(700);
    expect(() => valueToCents("1.234")).toThrow();
    expect(() => valueToCents("-1.00")).toThrow();
  });

  it("rejects fractional or negative cents", () => {
    expect(() => centsToValue(1.5)).toThrow();
    expect(() => centsToValue(-1)).toThrow();
  });

  it("formats dollars for people", () => {
    expect(formatUsd(200000)).toBe("$2,000.00");
  });
});
