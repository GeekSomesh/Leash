import { getConsoleState } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    return Response.json(await getConsoleState(await getDb()));
  } catch (error) {
    return errorResponse(error);
  }
}
