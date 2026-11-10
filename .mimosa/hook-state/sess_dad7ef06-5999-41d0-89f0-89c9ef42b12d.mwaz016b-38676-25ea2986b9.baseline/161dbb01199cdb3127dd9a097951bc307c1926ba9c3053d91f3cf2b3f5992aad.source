import { z } from "zod";
import { CONSOLE_USER_ID } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { errorResponse, readJson } from "@/lib/http";
import { resolveHeldPayment } from "@/lib/payments/service";

const Body = z.object({
  decision: z.enum(["approve", "decline"]),
  note: z.string().max(500).optional(),
});

/** Approve or decline a held payment. In the demo the console acts as Priya. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = Body.parse(await readJson(request));
    const payment = await resolveHeldPayment(await getDb(), { paymentId: id, approverId: CONSOLE_USER_ID, decision: body.decision, note: body.note });
    return Response.json({ id: payment.id, status: payment.status });
  } catch (error) {
    return errorResponse(error);
  }
}
