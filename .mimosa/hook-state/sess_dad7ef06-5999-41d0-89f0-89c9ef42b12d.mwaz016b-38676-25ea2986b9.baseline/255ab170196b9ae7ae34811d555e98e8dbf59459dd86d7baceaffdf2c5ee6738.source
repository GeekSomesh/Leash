import { getPaymentView } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const payment = await getPaymentView(await getDb(), id);
    return payment ? Response.json(payment) : Response.json({ error: "Payment not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
