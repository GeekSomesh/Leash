// Shared error handling for route handlers.

import { ZodError } from "zod";
import { ClaudeUnavailableError } from "@/lib/ai/claude";
import { PayPalApiError } from "@/lib/paypal/client";
import { LeashError } from "@/lib/payments/service";

const STATUS: Record<LeashError["code"], number> = {
  invalid_request: 400,
  not_found: 404,
  forbidden: 403,
  cooling_off: 409,
  invalid_state: 409,
  paypal: 502,
};

export function errorResponse(error: unknown): Response {
  if (error instanceof LeashError) return Response.json({ error: error.message, code: error.code }, { status: STATUS[error.code] });
  if (error instanceof ZodError) return Response.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  if (error instanceof PayPalApiError) {
    return Response.json({ error: `PayPal: ${error.issue ?? error.status}`, debugId: error.debugId }, { status: 502 });
  }
  if (error instanceof ClaudeUnavailableError) return Response.json({ error: error.message }, { status: 503 });
  console.error(error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
