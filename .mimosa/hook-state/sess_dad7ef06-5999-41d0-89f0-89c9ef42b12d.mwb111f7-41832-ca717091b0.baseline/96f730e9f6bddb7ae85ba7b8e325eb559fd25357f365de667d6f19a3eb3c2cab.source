import { getDb } from "@/lib/db/client";
import { isScenarioName, runScenario } from "@/lib/demo/scenarios";
import { errorResponse } from "@/lib/http";

export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isScenarioName(name)) return Response.json({ error: `Unknown scenario "${name}".` }, { status: 404 });
  try {
    const payment = await runScenario(await getDb(), name);
    return Response.json({ id: payment.id, outcome: payment.outcome, status: payment.status });
  } catch (error) {
    return errorResponse(error);
  }
}
