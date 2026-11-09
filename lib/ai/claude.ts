// One place that talks to Claude. Every call:
//   - uses Claude Opus 5.5 with an explicit effort level,
//   - opts into server-side refusal fallbacks (a declined request is retried on Anthropic's
//     recommended fallback model instead of failing),
//   - returns schema-validated JSON through structured outputs, or plain text.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const CLAUDE_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high";

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;

function claude(): Anthropic {
  // Reads ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the environment.
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

export class ClaudeUnavailableError extends Error {
  readonly name = "ClaudeUnavailableError";
}

/** Asks Claude for JSON matching `schema`. Throws ClaudeUnavailableError on refusal, truncation or invalid output. */
export async function askForJson<Schema extends z.ZodType>(input: {
  schema: Schema;
  system: string;
  prompt: string;
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<Schema>> {
  let response;
  try {
    response = await claude().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: input.maxTokens ?? 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: { effort: input.effort, format: betaZodOutputFormat(input.schema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new ClaudeUnavailableError(`Claude API error ${error.status ?? ""}: ${error.message}`);
    if (error instanceof Anthropic.AnthropicError) throw new ClaudeUnavailableError(`Claude returned output that didn't match the schema: ${error.message}`);
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ClaudeUnavailableError(`Claude declined the request (${response.stop_details?.category ?? "no category"}).`);
  }
  if (response.stop_reason === "max_tokens") throw new ClaudeUnavailableError("Claude's answer was cut off.");
  if (!response.parsed_output) throw new ClaudeUnavailableError("Claude returned no structured output.");
  return response.parsed_output as z.infer<Schema>;
}

/** Asks Claude for a short piece of text. */
export async function askForText(input: { system: string; prompt: string; effort: Effort; maxTokens?: number }): Promise<string> {
  let response;
  try {
    response = await claude().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: input.maxTokens ?? 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: { effort: input.effort },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new ClaudeUnavailableError(`Claude API error ${error.status ?? ""}: ${error.message}`);
    throw error;
  }
  if (response.stop_reason === "refusal") throw new ClaudeUnavailableError("Claude declined the request.");
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new ClaudeUnavailableError("Claude returned no text.");
  return text;
}

export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * One turn of an agent loop driven by someone else (AG Studio's agents): Claude sees the
 * conversation and the tools, and answers with text and/or tool calls. The caller runs
 * the tools and sends the results back on the next turn.
 */
export async function runToolTurn(input: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  /** Opus 5.5 rejects forced tool choice; steer from the system prompt instead. */
  toolChoice: "auto" | "none";
  effort: AgentEffort;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await claude().beta.messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: input.maxTokens ?? 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: input.system,
        messages: input.messages,
        ...(input.tools.length > 0 ? { tools: input.tools, tool_choice: { type: input.toolChoice } } : {}),
        output_config: { effort: input.effort },
      },
      { signal: input.signal },
    );
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new ClaudeUnavailableError(`Claude API error ${error.status ?? ""}: ${error.message}`);
    throw error;
  }
}
