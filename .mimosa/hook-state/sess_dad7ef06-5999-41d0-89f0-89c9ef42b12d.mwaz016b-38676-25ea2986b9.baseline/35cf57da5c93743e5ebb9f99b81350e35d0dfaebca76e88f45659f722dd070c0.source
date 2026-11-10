import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ledger, paypalEvents } from "@/lib/db/schema";
import { paypalConfigured } from "@/lib/paypal/client";
import { verifyWebhookSignature } from "@/lib/paypal/payments";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    payout_batch_id?: string;
    transaction_status?: string;
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
};

/**
 * PayPal webhooks. Every delivery is verified with PayPal before Leash acts on it, then
 * stored for audit. Verified events update the status of the matching ledger entry, so the
 * console shows what PayPal itself reports (e.g. a payout moving from PENDING to SUCCESS).
 */
export async function POST(request: Request) {
  let event: WebhookEvent;
  try {
    event = (await request.json()) as WebhookEvent;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!event.id || !event.event_type) return Response.json({ error: "Not a PayPal webhook event." }, { status: 400 });

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const verified = Boolean(webhookId && paypalConfigured()) && (await verifyWebhookSignature(request.headers, event, webhookId!).catch(() => false));

  const db = await getDb();
  await db
    .insert(paypalEvents)
    .values({ id: event.id, eventType: event.event_type, resourceId: event.resource?.id ?? null, verified, payload: event })
    .onConflictDoNothing();
  if (!verified) return Response.json({ received: true, verified: false }, { status: webhookId ? 400 : 202 });

  const resource = event.resource ?? {};
  const setStatus = (paypalId: string | undefined, status: string | undefined) =>
    paypalId && status ? db.update(ledger).set({ status }).where(eq(ledger.paypalId, paypalId)) : undefined;

  if (event.event_type.startsWith("PAYMENT.CAPTURE.") || event.event_type.startsWith("PAYMENT.AUTHORIZATION.")) {
    await setStatus(resource.id, resource.status ?? event.event_type.split(".").pop());
  } else if (event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    await setStatus(resource.batch_header?.payout_batch_id, resource.batch_header?.batch_status);
  } else if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    await setStatus(resource.payout_batch_id, resource.transaction_status);
  }
  return Response.json({ received: true, verified: true });
}
