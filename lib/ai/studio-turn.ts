// Runs one AG Studio agent turn on Claude. AG Studio's agent framework speaks in
// conversation items shaped like OpenAI's Responses API (messages, function calls and their
// outputs); this module translates them to Claude's Messages API and back, so Studio's
// built-in agents and our "Leash analyst" can run on Claude Opus 5.5.
//
// The translation is pure (see the tests); only runStudioTurn calls Claude.

import type Anthropic from "@anthropic-ai/sdk";
import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";
import { runToolTurn, type AgentEffort } from "./claude";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

/** Claude tool names may only use letters, digits, "_" and "-" (max 128); Studio's may not. */
export function toClaudeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128) || "tool";
}

/** Tool-use ids must be plain too; the same mapping is applied to calls and their results. */
const toClaudeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_") || "call";

const EFFORTS: readonly AgentEffort[] = ["low", "medium", "high", "xhigh", "max"];

export type ClaudeTurnInput = {
  system: string;
  messages: MessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  toolChoice: "auto" | "none";
  effort: AgentEffort;
  /** Claude tool name → the name Studio uses. */
  toolNames: Map<string, string>;
};

/** Builds Claude's request from Studio's. */
export function toClaudeTurn(request: AgLlmRequest): ClaudeTurnInput {
  const systemParts: string[] = [];
  if (request.instructions) systemParts.push(request.instructions);

  const toolNames = new Map<string, string>();
  const tools: Anthropic.Beta.BetaTool[] = [];
  for (const tool of request.tools ?? []) {
    if (tool.kind === "provided") continue; // Hosted by another model provider; Claude can't run it.
    const claudeName = toClaudeToolName(tool.name);
    toolNames.set(claudeName, tool.name);
    const schema = (tool.parameters ?? {}) as Record<string, unknown>;
    tools.push({
      name: claudeName,
      description: tool.description,
      input_schema: { ...schema, type: "object" } as Anthropic.Beta.BetaTool.InputSchema,
    });
  }

  // Forced tool choice isn't available on Claude Opus 5.5, so the same intent goes in the prompt.
  let toolChoice: "auto" | "none" = "auto";
  const choice = request.toolChoice;
  if (choice === "none") toolChoice = "none";
  else if (choice === "required") systemParts.push("You must answer this turn by calling one of the available tools.");
  else if (choice && typeof choice === "object") systemParts.push(`You must answer this turn by calling the tool ${toClaudeToolName(choice.name)}.`);

  if (request.responseFormat?.type === "json") {
    systemParts.push(
      `Answer with a single JSON object and nothing else (no prose, no code fences). It must match this JSON schema (${request.responseFormat.name}):\n${JSON.stringify(request.responseFormat.schema)}`,
    );
  }

  const messages: MessageParam[] = [];
  const push = (role: "user" | "assistant", blocks: ContentBlock[]) => {
    if (blocks.length === 0) return;
    const last = messages.at(-1);
    if (last && last.role === role && Array.isArray(last.content)) (last.content as ContentBlock[]).push(...blocks);
    else messages.push({ role, content: blocks });
  };

  for (const item of request.input as AgAiConversationItem[]) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content
        .map((part) => (part.type === "text" ? part.text : `[${part.type} attachment omitted]`))
        .join("\n")
        .trim();
      if (!text) continue;
      if (item.role === "system") systemParts.push(text);
      else push("user", [{ type: "text", text }]);
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content
        .map((part) => (part.type === "text" ? part.text : part.refusal))
        .join("")
        .trim();
      if (text) push("assistant", [{ type: "text", text }]);
    } else if (item.type === "function_call") {
      let parsed: unknown = {};
      try {
        parsed = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        parsed = { raw: item.arguments };
      }
      push("assistant", [{ type: "tool_use", id: toClaudeId(item.callId), name: toClaudeToolName(item.name), input: parsed as Record<string, unknown> }]);
    } else if (item.type === "function_call_output") {
      push("user", [{ type: "tool_result", tool_use_id: toClaudeId(item.callId), content: item.output || "(no output)" }]);
    }
    // Reasoning items are another model's private notes; they aren't replayed.
  }

  // The conversation must start with the user and can't end on an assistant turn (no prefill).
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: "Continue." });
  if (messages.at(-1)?.role === "assistant") messages.push({ role: "user", content: "Continue." });

  const requested = request.model?.effort;
  const effort = requested && (EFFORTS as readonly string[]).includes(requested) ? (requested as AgentEffort) : "medium";

  return { system: systemParts.join("\n\n"), messages, tools, toolChoice, effort, toolNames };
}

/** Turns Claude's answer into Studio's response: one message for the text, one item per tool call. */
export function fromClaudeMessage(message: Anthropic.Beta.BetaMessage, toolNames: Map<string, string>): AgLlmResponse {
  const output: AgAiOutputItem[] = [];
  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (text) {
    output.push({
      id: `msg_${message.id}`,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text, annotations: [] }],
    });
  }
  for (const block of message.content) {
    if (block.type !== "tool_use") continue;
    output.push({
      id: `fc_${block.id}`,
      kind: "output",
      type: "function_call",
      callId: block.id,
      name: toolNames.get(block.name) ?? block.name,
      arguments: JSON.stringify(block.input ?? {}),
      status: "completed",
    });
  }

  const base = { id: message.id, createdAt: Math.floor(Date.now() / 1000), output, model: message.model };
  if (message.stop_reason === "refusal") {
    return { ...base, status: "failed", error: { code: "refusal", message: "Claude declined this request." } };
  }
  if (message.stop_reason === "max_tokens") {
    return { ...base, status: "incomplete", incompleteDetails: { reason: "max_output_tokens" } };
  }
  return { ...base, status: "completed" };
}

/** One full turn: Studio request in, Studio response out. */
export async function runStudioTurn(request: AgLlmRequest, signal?: AbortSignal): Promise<AgLlmResponse> {
  const turn = toClaudeTurn(request);
  const message = await runToolTurn({ ...turn, signal });
  return fromClaudeMessage(message, turn.toolNames);
}
