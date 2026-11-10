import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson } from "./openrouter";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it.each([
    ['```json\n{"a": 1}\n```', { a: 1 }],
    ["```\n{\"a\": 2}\n```", { a: 2 }],
    ['Here is the JSON you asked for:\n{"a": 3}\nHope that helps!', { a: 3 }],
    ['Sure! {"a": {"b": [1, 2]}} — let me know.', { a: { b: [1, 2] } }],
    ['{"a": 1}\ntrailing prose with } brace', { a: 1 }],
  ])("parses %s", (text, expected) => {
    expect(extractJson(text)).toEqual(expected);
  });

  it("returns null for non-JSON answers", () => {
    expect(extractJson("I cannot help with that.")).toBeNull();
    expect(extractJson("{\"a\": ")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("askForJson schema contract", () => {
  // The JSON Schema in the prompt is generated from the zod schema; make sure the
  // conversion the model sees stays strict (no extra keys, nullable fields allowed).
  it("converts a zod schema to a strict JSON schema", () => {
    const schema = z.object({ verdict: z.enum(["a", "b"]), note: z.string().nullable() });
    const jsonSchema = z.toJSONSchema(schema) as { type: string; required: string[]; properties: Record<string, { type: string[] }> };
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.required).toEqual(["verdict", "note"]);
    expect(jsonSchema.properties.note?.type).toEqual(["string", "null"]);
  });
});
