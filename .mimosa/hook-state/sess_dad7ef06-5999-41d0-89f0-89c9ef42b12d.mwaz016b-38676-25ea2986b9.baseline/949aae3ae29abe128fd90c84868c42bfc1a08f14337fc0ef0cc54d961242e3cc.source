import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/** Health check for Render: the app is up and the database answers. */
export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
