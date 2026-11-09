import type { AgLlmRequest } from "ag-studio";
import { z } from "zod";
import { claudeConfigured, ClaudeUnavailableError } from "@/lib/ai/claude";
import { runStudioTurn } from "@/lib/ai/studio-turn";
import { readJson } from "@/lib/http";

// One AG Studio agent turn on Claude (see lib/ai/studio-turn.ts). The browser-side adapter
// posts Studio's request here, so the Anthropic key never leaves the server.

const Body = z.object({
  input: z.array(z.record(z.string(), z.unknown())).max(400),
  instructions: z.string().max(200_000).optional(),
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(20_000),
        parameters: z.record(z.string(), z.unknown()),
        kind: z.enum(["client", "server", "provided"]).optional(),
        provider: z.unknown().optional(),
      }),
    )
    .max(100)
    .optional(),
  toolChoice: z.union([z.enum(["auto", "none", "required"]), z.object({ name: z.string().max(200) })]).optional(),
  responseFormat: z.union([
    z.object({ type: z.literal("text") }),
    z.object({ type: z.literal("json"), name: z.string().max(200), description: z.string().max(2000).optional(), schema: z.record(z.string(), z.unknown()) }),
  ]),
  model: z.object({ id: z.string().max(100), effort: z.string().max(20).optional() }).optional(),
});

// Every turn is a paid Claude call and the demo has no sign-in, so turns are capped per client
// and overall. The overall cap still holds if a client fakes its X-Forwarded-For header.
const WINDOW_MS = 10 * 60_000;
const MAX_TURNS_PER_CLIENT = 60;
const MAX_TURNS_OVERALL = 300;
const recentTurns = new Map<string, number[]>();
let allTurns: number[] = [];

function allowTurn(client: string): boolean {
  const now = Date.now();
  const recent = (t: number) => now - t < WINDOW_MS;
  allTurns = allTurns.filter(recent);
  if (recentTurns.size > 5_000) {
    for (const [key, times] of recentTurns) if (!times.some(recent)) recentTurns.delete(key);
  }
  const turns = (recentTurns.get(client) ?? []).filter(recent);
  if (turns.length >= MAX_TURNS_PER_CLIENT || allTurns.length >= MAX_TURNS_OVERALL) return false;
  turns.push(now);
  allTurns.push(now);
  recentTurns.set(client, turns);
  return true;
}

export async function POST(request: Request) {
  if (!claudeConfigured()) {
    return Response.json({ error: "The insights analyst needs Claude: set ANTHROPIC_API_KEY on the server." }, { status: 503 });
  }
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowTurn(client)) {
    return Response.json({ error: "Too many analyst requests. Try again in a few minutes." }, { status: 429 });
  }

  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return Response.json({ error: "Invalid agent request." }, { status: 400 });

  try {
    return Response.json(await runStudioTurn(parsed.data as unknown as AgLlmRequest, request.signal));
  } catch (error) {
    if (error instanceof ClaudeUnavailableError) {
      // Keep Claude's error details in the server log; the browser gets a plain message.
      console.error("Leash analyst:", error.message);
      return Response.json({ error: "The Leash analyst couldn't reach Claude. Try again in a minute." }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: "The analyst couldn't answer." }, { status: 500 });
  }
}
