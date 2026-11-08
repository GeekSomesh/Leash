import { z } from "zod";
import { claudeConfigured } from "@/lib/ai/claude";
import { compilePolicy } from "@/lib/ai/compile-policy";
import { errorResponse, readJson } from "@/lib/http";

const Body = z.object({
  rules: z.string().min(10).max(4000),
  agentName: z.string().max(100),
  ownerName: z.string().max(100),
  guardianName: z.string().max(100).nullable().default(null),
});

/** Compiles plain-English rules into a policy and reads it back in plain English. */
export async function POST(request: Request) {
  if (!claudeConfigured()) return Response.json({ error: "Set ANTHROPIC_API_KEY to compile policies from plain English." }, { status: 503 });
  try {
    return Response.json(await compilePolicy(Body.parse(await readJson(request))));
  } catch (error) {
    return errorResponse(error);
  }
}
