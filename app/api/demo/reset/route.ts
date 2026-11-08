import { getDb } from "@/lib/db/client";
import { resetDemo } from "@/lib/demo/seed";
import { errorResponse } from "@/lib/http";

/** Resets the demo data. Returns each agent's new MCP token (shown once). */
export async function POST() {
  try {
    const { tokens } = await resetDemo(await getDb());
    return Response.json({ tokens });
  } catch (error) {
    return errorResponse(error);
  }
}
