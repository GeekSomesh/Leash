import { CONSOLE_USER_ID } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { refundPayment } from "@/lib/payments/service";

/** Refunds a paid payment. In the demo the console acts as Priya (the owner). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const payment = await refundPayment(await getDb(), { paymentId: id, requesterId: CONSOLE_USER_ID });
    return Response.json({ id: payment.id, status: payment.status });
  } catch (error) {
    return errorResponse(error);
  }
}
