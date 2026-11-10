import { z } from "zod";
import { CONSOLE_USER_ID } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { errorResponse, readJson } from "@/lib/http";
import { requestAllowance } from "@/lib/payments/service";

const Body = z.object({
  amountCents: z.number().int().min(100).max(100_000).default(15000),
  days: z.number().int().min(1).max(29).default(7),
});

/** Starts a new allowance hold. With PayPal configured, returns the URL where the owner approves it. */
export async function POST(request: Request) {
  try {
    const body = Body.parse(await readJson(request));
    const allowance = await requestAllowance(await getDb(), { ownerId: CONSOLE_USER_ID, ...body });
    return Response.json({ id: allowance.id, status: allowance.status, approveUrl: allowance.approveUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
