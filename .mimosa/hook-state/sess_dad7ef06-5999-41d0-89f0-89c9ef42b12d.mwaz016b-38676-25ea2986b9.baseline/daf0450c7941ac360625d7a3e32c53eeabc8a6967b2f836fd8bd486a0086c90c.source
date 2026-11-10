import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { resetDemo } from "@/lib/demo/seed";
import { errorResponse } from "@/lib/http";

/**
 * The reset is open while no secret is configured (the demo must work out of the box), and
 * requires the secret in the x-admin-secret header once LEASH_ADMIN_SECRET is set. Both
 * sides are hashed before comparing, so the check is constant-time and length-safe.
 */
function authorized(request: Request): boolean {
  const secret = process.env.LEASH_ADMIN_SECRET;
  if (!secret) return true;
  const presented = request.headers.get("x-admin-secret") ?? "";
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(presented).digest();
  return timingSafeEqual(expected, actual);
}

/** Resets the demo data. Returns each agent's new MCP token (shown once). */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "This demo reset needs the admin secret in the x-admin-secret header." }, { status: 403 });
  try {
    const { tokens } = await resetDemo(await getDb());
    return Response.json({ tokens });
  } catch (error) {
    return errorResponse(error);
  }
}
