import { z } from "zod";
import { getPaymentView } from "@/lib/console-state";
import { getDb } from "@/lib/db/client";
import { parseVoicePayment } from "@/lib/ai/parse-voice";
import { DEMO_IDS, arjunEmail } from "@/lib/demo/seed";
import { errorResponse, readJson } from "@/lib/http";
import { agentOrThrow, LeashError, submitPayment } from "@/lib/payments/service";

const Body = z.object({
  text: z.string().min(2).max(2000).describe("What the person said to the assistant"),
  /** What the caller said, kept as untrusted evidence for the detectors. */
  callerNote: z.string().max(4000).optional(),
});

/**
 * The voice assistant's endpoint: spoken words in, a Leash decision out. Parses the request
 * (Claude when configured, patterns otherwise) and submits it as Ramesh's voice assistant,
 * so it goes through exactly the same pipeline as an MCP agent.
 */
export async function POST(request: Request) {
  try {
    const { text, callerNote } = Body.parse(await readJson(request));
    const db = await getDb();
    const parsed = await parseVoicePayment(text);
    if (!parsed.amountCents || parsed.amountCents <= 0) {
      throw new LeashError(
        'I couldn\'t tell how much to send. Try something like "send two thousand dollars to Arjun".',
        "invalid_state",
      );
    }

    const email = (parsed.payeeEmail ?? arjunEmail()).toLowerCase();
    const name = parsed.payeeName ?? parsed.payeeEmail?.split("@")[0] ?? "Arjun";
    const agent = await agentOrThrow(db, DEMO_IDS.voiceAssistant);
    const payment = await submitPayment(db, agent, {
      kind: "transfer",
      mandateId: null,
      payee: { id: email, name, type: "person", paypalEmail: email, declaredCategories: [] },
      items: [],
      shippingCents: 0,
      taxCents: 0,
      totalCents: parsed.amountCents,
      justification: `Ramesh asked by voice: "${text}"`,
      evidence: [
        { source: "voice_transcript", url: null, content: text },
        ...(callerNote ? [{ source: "chat_message" as const, url: null, content: callerNote }] : []),
      ],
    });
    return Response.json(await getPaymentView(db, payment.id));
  } catch (error) {
    return errorResponse(error);
  }
}
