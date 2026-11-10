// The PayPal calls behind Leash's money flows:
//
//   Allowance (agents):  create AUTHORIZE order -> owner approves in PayPal -> authorize
//                        -> partial capture per approved purchase (final_capture: false)
//                        -> void what's left at the end of the period
//   Held transfer:       create AUTHORIZE order -> person approves -> authorize
//                        -> guardian approves: capture, then pay the recipient via Payouts
//                        -> guardian declines: void (the money never moves)
//   Refunds:             refund a capture
//   Settlement:          Payouts to the merchant or person who was paid

import { centsToValue, valueToCents, type Cents } from "@/lib/money";
import { linkHref, paypalRequest } from "./client";

type Money = { value: string; currency_code: string };
type Link = { href: string; rel: string; method?: string };

// --- Orders ----------------------------------------------------------------------------

export type CreateAuthorizeOrderInput = {
  amountCents: Cents;
  description: string;
  /** Our own id for this order (e.g. the allowance or payment request id). */
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
};

export type CreatedOrder = { orderId: string; status: string; approveUrl: string };

export async function createAuthorizeOrder(input: CreateAuthorizeOrderInput): Promise<CreatedOrder> {
  const order = await paypalRequest<{ id: string; status: string; links?: Link[] }>("POST", "/v2/checkout/orders", {
    requestId: input.requestId,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: centsToValue(input.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Leash",
            shipping_preference: "NO_SHIPPING",
            // "Continue", not "Pay Now": approving only places a hold.
            user_action: "CONTINUE",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = linkHref(order.links, "payer-action", "approve");
  if (!approveUrl) throw new Error(`PayPal order ${order.id} came back without an approval link.`);
  return { orderId: order.id, status: order.status, approveUrl };
}

export type Authorization = {
  authorizationId: string;
  status: string;
  amountCents: Cents;
  expirationTime: string | undefined;
};

type AuthorizationResource = { id: string; status: string; amount: Money; expiration_time?: string };

const toAuthorization = (a: AuthorizationResource): Authorization => ({
  authorizationId: a.id,
  status: a.status,
  amountCents: valueToCents(a.amount.value),
  expirationTime: a.expiration_time,
});

/** Turns an approved AUTHORIZE order into an authorization: the funds are now held. */
export async function authorizeOrder(orderId: string, requestId: string): Promise<Authorization> {
  const order = await paypalRequest<{
    id: string;
    status: string;
    purchase_units: { payments?: { authorizations?: AuthorizationResource[] } }[];
  }>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, { requestId, body: {} });
  const authorization = order.purchase_units[0]?.payments?.authorizations?.[0];
  if (!authorization) throw new Error(`Authorizing order ${orderId} returned no authorization.`);
  return toAuthorization(authorization);
}

export async function getOrderStatus(orderId: string): Promise<string> {
  const order = await paypalRequest<{ status: string }>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  return order.status;
}

// --- Authorizations ----------------------------------------------------------------------

export async function getAuthorization(authorizationId: string): Promise<Authorization> {
  return toAuthorization(await paypalRequest<AuthorizationResource>("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`));
}

export type Capture = { captureId: string; status: string; amountCents: Cents };

/**
 * Captures part (or all) of an authorization. With `finalCapture: false` more captures can
 * follow, which is how one held allowance pays for many purchases.
 */
export async function captureAuthorization(
  authorizationId: string,
  input: { amountCents: Cents; finalCapture: boolean; invoiceId: string; noteToPayer?: string; requestId: string },
): Promise<Capture> {
  const capture = await paypalRequest<{ id: string; status: string; amount: Money }>(
    "POST",
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      requestId: input.requestId,
      body: {
        amount: { currency_code: "USD", value: centsToValue(input.amountCents) },
        final_capture: input.finalCapture,
        invoice_id: input.invoiceId,
        ...(input.noteToPayer ? { note_to_payer: input.noteToPayer.slice(0, 255) } : {}),
      },
    },
  );
  return { captureId: capture.id, status: capture.status, amountCents: valueToCents(capture.amount.value) };
}

/** Releases a hold: nothing more can be captured, and the uncaptured amount is never charged. */
export async function voidAuthorization(authorizationId: string, requestId: string): Promise<{ status: string }> {
  const result = await paypalRequest<{ status?: string }>("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    requestId,
  });
  return { status: result.status ?? "VOIDED" };
}

/** After the 3-day honor period, confirms the funds are still available. Returns a new authorization id. */
export async function reauthorize(authorizationId: string, amountCents: Cents, requestId: string): Promise<Authorization> {
  return toAuthorization(
    await paypalRequest<AuthorizationResource>("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`, {
      requestId,
      body: { amount: { currency_code: "USD", value: centsToValue(amountCents) } },
    }),
  );
}

// --- Refunds -------------------------------------------------------------------------------

export async function refundCapture(
  captureId: string,
  input: { amountCents: Cents; noteToPayer: string; requestId: string },
): Promise<{ refundId: string; status: string }> {
  const refund = await paypalRequest<{ id: string; status: string }>("POST", `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    requestId: input.requestId,
    body: {
      amount: { currency_code: "USD", value: centsToValue(input.amountCents) },
      note_to_payer: input.noteToPayer.slice(0, 255),
    },
  });
  return { refundId: refund.id, status: refund.status };
}

// --- Payouts -----------------------------------------------------------------------------

export type PayoutItem = { receiverEmail: string; amountCents: Cents; note: string; senderItemId: string };

/** Sends money to merchants or people by email. `senderBatchId` must be unique; it also makes the call idempotent. */
export async function createPayout(input: { senderBatchId: string; emailSubject: string; items: PayoutItem[] }): Promise<{ batchId: string; batchStatus: string }> {
  const result = await paypalRequest<{ batch_header: { payout_batch_id: string; batch_status: string } }>("POST", "/v1/payments/payouts", {
    requestId: input.senderBatchId,
    body: {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: input.emailSubject,
        recipient_type: "EMAIL",
      },
      items: input.items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.receiverEmail,
        amount: { currency: "USD", value: centsToValue(item.amountCents) },
        note: item.note.slice(0, 4000),
        sender_item_id: item.senderItemId,
      })),
    },
  });
  return { batchId: result.batch_header.payout_batch_id, batchStatus: result.batch_header.batch_status };
}

export async function getPayoutBatch(batchId: string): Promise<{ batchStatus: string; itemStatuses: string[] }> {
  const batch = await paypalRequest<{
    batch_header: { batch_status: string };
    items?: { transaction_status?: string }[];
  }>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  return { batchStatus: batch.batch_header.batch_status, itemStatuses: (batch.items ?? []).map((i) => i.transaction_status ?? "UNKNOWN") };
}

// --- Webhooks ------------------------------------------------------------------------------

/** Asks PayPal whether a webhook delivery really came from PayPal. */
export async function verifyWebhookSignature(headers: Headers, event: unknown, webhookId: string): Promise<boolean> {
  const header = (name: string) => headers.get(name) ?? "";
  const result = await paypalRequest<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return result.verification_status === "SUCCESS";
}
