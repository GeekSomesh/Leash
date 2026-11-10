import type { AgLlmRequest } from "ag-studio";
import { describe, expect, it } from "vitest";
import { fromOpenAiResponse, toOpenAiTurn, toSafeToolName } from "./studio-turn";

const tool = (name: string) => ({ name, description: `Runs ${name}`, parameters: { type: "object", properties: { q: { type: "string" } } } });

const baseRequest: AgLlmRequest = {
  instructions: "You build dashboards.",
  responseFormat: { type: "text" },
  tools: [tool("studio.executeQuery"), tool("delegate:widget")],
  input: [
    { id: "u1", kind: "input", type: "message", role: "user", status: "completed", content: [{ type: "text", text: "What did the agents spend?" }] },
    { id: "a1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Let me check.", annotations: [] }] },
    { id: "f1", kind: "output", type: "function_call", callId: "call.1", name: "studio.executeQuery", arguments: '{"q":"spend"}' },
    { id: "r1", kind: "input", type: "function_call_output", callId: "call.1", output: '{"rows":[]}', status: "completed" },
  ],
};

function rawTurn(content: string | null, toolCalls: unknown[] = [], finishReason = "stop") {
  return {
    id: "chatcmpl_1",
    model: "test-model",
    message: { content, tool_calls: toolCalls as never },
    finishReason,
  };
}

describe("toOpenAiTurn", () => {
  it("renames tools to safe names and remembers the originals", () => {
    const turn = toOpenAiTurn(baseRequest);
    expect(turn.tools.map((t) => t.function.name)).toEqual(["studio_executeQuery", "delegate_widget"]);
    expect(turn.toolNames.get("studio_executeQuery")).toBe("studio.executeQuery");
    expect(turn.tools[0]?.function.parameters.type).toBe("object");
    expect(toSafeToolName("a.b c")).toBe("a_b_c");
  });

  it("maps the conversation: user text, assistant text + tool call, then the tool result", () => {
    const { messages, system } = toOpenAiTurn(baseRequest);
    expect(system).toBe("You build dashboards.");
    expect(messages).toEqual([
      { role: "user", content: "What did the agents spend?" },
      {
        role: "assistant",
        content: "Let me check.",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "studio_executeQuery", arguments: '{"q":"spend"}' } }],
      },
      { role: "tool", tool_call_id: "call_1", content: '{"rows":[]}' },
    ]);
  });

  it("moves system messages into the system prompt and never ends on an assistant turn", () => {
    const turn = toOpenAiTurn({
      ...baseRequest,
      input: [
        { id: "s1", kind: "input", type: "message", role: "system", status: "completed", content: [{ type: "text", text: "Today is Monday." }] },
        { id: "a1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Hi", annotations: [] }] },
      ],
    });
    expect(turn.system).toContain("Today is Monday.");
    expect(turn.messages[0]?.role).toBe("user");
    expect(turn.messages.at(-1)?.role).toBe("user");
  });

  it("turns a forced tool choice into an instruction", () => {
    const turn = toOpenAiTurn({ ...baseRequest, toolChoice: { name: "studio.executeQuery" } });
    expect(turn.toolChoice).toBe("auto");
    expect(turn.system).toContain("calling the tool studio_executeQuery");
    expect(toOpenAiTurn({ ...baseRequest, toolChoice: "none" }).toolChoice).toBe("none");
  });

  it("uses the requested effort when valid, medium otherwise", () => {
    expect(toOpenAiTurn({ ...baseRequest, model: { id: "x", effort: "high" } }).effort).toBe("high");
    expect(toOpenAiTurn({ ...baseRequest, model: { id: "x", effort: "turbo" } }).effort).toBe("medium");
  });
});

describe("fromOpenAiResponse", () => {
  const names = new Map([["studio_executeQuery", "studio.executeQuery"]]);

  it("returns the text as one message and each tool call with Studio's tool name", () => {
    const response = fromOpenAiResponse(
      rawTurn("Here is the query.", [{ id: "call_9", type: "function", function: { name: "studio_executeQuery", arguments: '{"q":"blocked"}' } }]),
      names,
    );
    expect(response.status).toBe("completed");
    expect(response.output[0]).toMatchObject({ type: "message", role: "assistant", content: [{ type: "text", text: "Here is the query." }] });
    expect(response.output[1]).toMatchObject({ type: "function_call", callId: "call_9", name: "studio.executeQuery", arguments: '{"q":"blocked"}' });
  });

  it("reports refusals and truncation instead of pretending they completed", () => {
    expect(fromOpenAiResponse(rawTurn(null, [], "content_filter"), names)).toMatchObject({ status: "failed", error: { code: "refusal" } });
    expect(fromOpenAiResponse(rawTurn("Partial", [], "length"), names)).toMatchObject({
      status: "incomplete",
      incompleteDetails: { reason: "max_output_tokens" },
    });
  });
});
