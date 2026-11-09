import type Anthropic from "@anthropic-ai/sdk";
import type { AgLlmRequest } from "ag-studio";
import { describe, expect, it } from "vitest";
import { fromClaudeMessage, toClaudeToolName, toClaudeTurn } from "./studio-turn";

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

function claudeMessage(content: unknown[], stop: string = "end_turn"): Anthropic.Beta.BetaMessage {
  return { id: "msg_1", model: "claude-opus-5-5", content, stop_reason: stop } as unknown as Anthropic.Beta.BetaMessage;
}

describe("toClaudeTurn", () => {
  it("renames tools to Claude-safe names and remembers the originals", () => {
    const turn = toClaudeTurn(baseRequest);
    expect(turn.tools.map((t) => t.name)).toEqual(["studio_executeQuery", "delegate_widget"]);
    expect(turn.toolNames.get("studio_executeQuery")).toBe("studio.executeQuery");
    expect(turn.tools[0]?.input_schema.type).toBe("object");
    expect(toClaudeToolName("a.b c")).toBe("a_b_c");
  });

  it("maps the conversation: user text, assistant text + tool call, then the tool result", () => {
    const { messages, system } = toClaudeTurn(baseRequest);
    expect(system).toBe("You build dashboards.");
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "What did the agents spend?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "call_1", name: "studio_executeQuery", input: { q: "spend" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: '{"rows":[]}' }] },
    ]);
  });

  it("moves system messages into the system prompt and never ends on an assistant turn", () => {
    const turn = toClaudeTurn({
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

  it("turns a forced tool choice into an instruction (Opus 5.5 can't force tools)", () => {
    const turn = toClaudeTurn({ ...baseRequest, toolChoice: { name: "studio.executeQuery" } });
    expect(turn.toolChoice).toBe("auto");
    expect(turn.system).toContain("calling the tool studio_executeQuery");
    expect(toClaudeTurn({ ...baseRequest, toolChoice: "none" }).toolChoice).toBe("none");
  });

  it("uses the requested effort when valid, medium otherwise", () => {
    expect(toClaudeTurn({ ...baseRequest, model: { id: "claude-opus-5-5", effort: "high" } }).effort).toBe("high");
    expect(toClaudeTurn({ ...baseRequest, model: { id: "claude-opus-5-5", effort: "turbo" } }).effort).toBe("medium");
  });
});

describe("fromClaudeMessage", () => {
  const names = new Map([["studio_executeQuery", "studio.executeQuery"]]);

  it("returns the text as one message and each tool call with Studio's tool name", () => {
    const response = fromClaudeMessage(
      claudeMessage([
        { type: "text", text: "Here is the query." },
        { type: "tool_use", id: "toolu_1", name: "studio_executeQuery", input: { q: "blocked" } },
      ]),
      names,
    );
    expect(response.status).toBe("completed");
    expect(response.output[0]).toMatchObject({ type: "message", role: "assistant", content: [{ type: "text", text: "Here is the query." }] });
    expect(response.output[1]).toMatchObject({ type: "function_call", callId: "toolu_1", name: "studio.executeQuery", arguments: '{"q":"blocked"}' });
  });

  it("reports refusals and truncation instead of pretending they completed", () => {
    expect(fromClaudeMessage(claudeMessage([], "refusal"), names)).toMatchObject({ status: "failed", error: { code: "refusal" } });
    expect(fromClaudeMessage(claudeMessage([{ type: "text", text: "Partial" }], "max_tokens"), names)).toMatchObject({
      status: "incomplete",
      incompleteDetails: { reason: "max_output_tokens" },
    });
  });
});
