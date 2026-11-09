// AG Studio's LLM adapter for Claude. Studio drives the agent loop and runs the tools; each
// model turn goes to Leash's server (/api/ai/studio), which calls Claude Opus 5.5 with the
// key kept server-side. The final response is replayed as Studio's content events.

import type { AgAiEvent, AgLlmAdapter, AgLlmResponse } from "ag-studio";

function unanswered(status: "failed" | "cancelled", code: string, message: string): AgLlmResponse {
  return { id: `leash_${Date.now()}`, createdAt: Math.floor(Date.now() / 1000), output: [], status, error: { code, message } };
}

function* contentEvents(response: AgLlmResponse): Generator<AgAiEvent> {
  for (const item of response.output) {
    if (item.type === "message") {
      const text = item.content.map((part) => (part.type === "text" ? part.text : part.refusal)).join("");
      yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" };
      yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: text };
      yield { type: "TEXT_MESSAGE_END", messageId: item.id };
    } else if (item.type === "function_call") {
      yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
      yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
      yield { type: "TOOL_CALL_END", toolCallId: item.callId };
    }
  }
}

export const claudeStudioAdapter: AgLlmAdapter = {
  executeTurn(request, options) {
    const complete: Promise<AgLlmResponse> = fetch("/api/ai/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options?.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as AgLlmResponse & { error?: string | { message: string } };
        if (res.ok) return body;
        const message = typeof body.error === "string" ? body.error : (body.error?.message ?? `The analyst request failed (${res.status}).`);
        return unanswered("failed", `http_${res.status}`, message);
      })
      .catch((error: unknown) =>
        options?.signal?.aborted
          ? unanswered("cancelled", "cancelled", "Stopped.")
          : unanswered("failed", "network_error", error instanceof Error ? error.message : String(error)),
      );

    return {
      complete,
      stream: {
        async *[Symbol.asyncIterator]() {
          yield* contentEvents(await complete);
        },
      },
    };
  },
};
