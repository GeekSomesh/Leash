import { eq } from "drizzle-orm";
import { appBaseUrl } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { errorResponse } from "@/lib/http";
import { hashToken, newAgentToken } from "@/lib/payments/ids";

/** Issues a new MCP token for an agent (the old one stops working). The token is shown once. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const token = newAgentToken();
    const updated = await (await getDb()).update(agents).set({ tokenHash: hashToken(token) }).where(eq(agents.id, id)).returning({ id: agents.id });
    if (updated.length === 0) return Response.json({ error: "Agent not found." }, { status: 404 });
    return Response.json({ agentId: id, token, mcpUrl: `${appBaseUrl()}/api/mcp` });
  } catch (error) {
    return errorResponse(error);
  }
}
