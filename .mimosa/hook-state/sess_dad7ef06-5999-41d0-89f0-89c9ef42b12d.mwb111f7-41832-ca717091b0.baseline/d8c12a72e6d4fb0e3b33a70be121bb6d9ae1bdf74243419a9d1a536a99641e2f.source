import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { PolicySchema } from "@/lib/domain/schemas";
import { describePolicy } from "@/lib/policy/describe";
import { errorResponse, readJson } from "@/lib/http";

const Body = z.object({
  /** The compiled policy (from POST /api/policies/compile), re-validated here. */
  policy: PolicySchema,
  /** The owner's plain-English rules the policy was compiled from, kept for the UI. */
  policySource: z.string().min(10).max(4000),
});

/** Saves an agent's policy. The body must be the compiled JSON; plain text is compiled first. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { policy, policySource } = Body.parse(await readJson(request));
    const db = await getDb();
    const updated = await db
      .update(agents)
      .set({ policy, policySource, policyUpdatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning({ id: agents.id });
    if (updated.length === 0) return Response.json({ error: "Agent not found." }, { status: 404 });
    return Response.json({ agentId: id, rules: describePolicy(policy) });
  } catch (error) {
    return errorResponse(error);
  }
}
