// Runs one AG Studio agent turn on the AI model. AG Studio's agent framework speaks in
// conversation items shaped like OpenAI's Responses API; this module translates them to the
// OpenAI-compatible chat shapes used by OpenRouter (see lib/ai/openrouter.ts) and back, so
// Studio's built-in agents and our "Leash analyst" run on the configured model.
//
// The translation is pure (see the tests); only runStudioTurn calls the model.

import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";
import { runToolTurn, type AgentEffort, type ChatMessage, type ChatTool, type ChatToolCall } from "./openrouter";

/** Tool names may only use letters, digits, "_" and "-" (max 64); Studio's may not. */
export function toSafeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
}

/** Tool-call ids must be plain too; the same mapping is applied to calls and their results. */
const toSafeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_") || "call";

const EFFORTS: readonly AgentEffort[] = ["low", "medium", "high", "xhigh", "max"];

export type OpenAiTurn = {
  system: string;
  messages: ChatMessage[];
  tools: ChatTool[];
  toolChoice: "auto" | "none";
  effort: AgentEffort;
  /** Safe tool name → the name Studio uses. */
  toolNames: Map<string, string>;
};

/** Builds the chat request from Studio's. */
export function toOpenAiTurn(request: AgLlmRequest): OpenAiTurn {
  const systemParts: string[] = [];
  if (request.instructions) systemParts.push(request.instructions);

  const toolNames = new Map<string, string>();
  const tools: ChatTool[] = [];
  for (const tool of request.tools ?? []) {
    if (tool.kind === "provided") continue; // Hosted by another model provider; our model can't run it.
    const safeName = toSafeToolName(tool.name);
    toolNames.set(safeName, tool.name);
    const schema = (tool.parameters ?? {}) as Record<string, unknown>;
    tools.push({ type: "function", function: { name: safeName, description: tool.description, parameters: { ...schema, type: "object" } } });
  }

  // Forced tool choice isn't available on this model, so the same intent goes in the prompt.
  let toolChoice: "auto" | "none" = "auto";
  const choice = request.toolChoice;
  if (choice === "none") toolChoice = "none";
  else if (choice === "required") systemParts.push("You must answer this turn by calling one of the available tools.");
  else if (choice && typeof choice === "object") systemParts.push(`You must answer this turn by calling the tool ${toSafeToolName(choice.name)}.`);

  if (request.responseFormat?.type === "json") {
    systemParts.push(
      `Answer with a single JSON object and nothing else (no prose, no code fences). It must match this JSON schema (${request.responseFormat.name}):\n${JSON.stringify(request.responseFormat.schema)}`,
    );
  }

  const messages: ChatMessage[] = [];
  const pushUserOrAssistant = (role: "user" | "assistant", message: ChatMessage) => {
    if (role === "user") {
      const last = messages.at(-1);
      if (last && last.role === "user") {
        last.content = `${last.content}\n${(message as { content: string }).content}`;
        return;
      }
    }
    if (role === "assistant") {
      const last = messages.at(-1);
      if (last && last.role === "assistant") {
        const incoming = message as Extract<ChatMessage, { role: "assistant" }>;
        last.content = [last.content, incoming.content].filter((part): part is string => Boolean(part)).join("\n") || null;
        last.tool_calls = [...(last.tool_calls ?? []), ...(incoming.tool_calls ?? [])];
        return;
      }
    }
    messages.push(message);
  };

  for (const item of request.input as AgAiConversationItem[]) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content
        .map((part) => (part.type === "text" ? part.text : `[${part.type} attachment omitted]`))
        .join("\n")
        .trim();
      if (!text) continue;
      if (item.role === "system") systemParts.push(text);
      else pushUserOrAssistant("user", { role: "user", content: text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content
        .map((part) => (part.type === "text" ? part.text : part.refusal))
        .join("")
        .trim();
      if (text) pushUserOrAssistant("assistant", { role: "assistant", content: text });
    } else if (item.type === "function_call") {
      let parsed: unknown = {};
      try {
        parsed = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        parsed = { raw: item.arguments };
      }
      const toolCall: ChatToolCall = { id: toSafeId(item.callId), type: "function", function: { name: toSafeToolName(item.name), arguments: JSON.stringify(parsed ?? {}) } };
      pushUserOrAssistant("assistant", { role: "assistant", content: null, tool_calls: [toolCall] });
    } else if (item.type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: toSafeId(item.callId), content: item.output || "(no output)" });
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

/** Turns the model's answer into Studio's response: one message for the text, one item per tool call. */
export function fromOpenAiResponse(
  raw: { id: string; model: string; message: { content: string | null; tool_calls?: ChatToolCall[] }; finishReason: string },
  toolNames: Map<string, string>,
): AgLlmResponse {
  const output: AgAiOutputItem[] = [];
  const text = (raw.message.content ?? "").trim();
  if (text) {
    output.push({
      id: `msg_${raw.id}`,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "text", text, annotations: [] }],
    });
  }
  for (const call of raw.message.tool_calls ?? []) {
    output.push({
      id: `fc_${call.id}`,
      kind: "output",
      type: "function_call",
      callId: call.id,
      name: toolNames.get(call.function.name) ?? call.function.name,
      arguments: call.function.arguments,
      status: "completed",
    });
  }

  const base = { id: raw.id, createdAt: Math.floor(Date.now() / 1000), output, model: raw.model };
  if (raw.finishReason === "content_filter") {
    return { ...base, status: "failed", error: { code: "refusal", message: "The model declined this request." } };
  }
  if (raw.finishReason === "length") {
    return { ...base, status: "incomplete", incompleteDetails: { reason: "max_output_tokens" } };
  }
  return { ...base, status: "completed" };
}

/** One full turn: Studio request in, Studio response out. */
export async function runStudioTurn(request: AgLlmRequest, signal?: AbortSignal): Promise<AgLlmResponse> {
  const turn = toOpenAiTurn(request);
  const raw = await runToolTurn({ ...turn, signal });
  return fromOpenAiResponse(raw, turn.toolNames);
}
