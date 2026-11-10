import { getDb } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { voidAllowance } from "@/lib/payments/service";

/** Releases whatever is left of an allowance hold. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const allowance = await voidAllowance(await getDb(), id);
    return Response.json({ id: allowance.id, status: allowance.status });
  } catch (error) {
    return errorResponse(error);
  }
}
