import { getDb } from "@/lib/db/client";
import { handlePayerReturn } from "@/lib/payments/service";

/**
 * PayPal redirects the payer here after they approve an allowance or a transfer hold
 * (?token=<order id>&PayerID=...). Leash authorizes the order and returns to the console.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  const back = new URL("/", url);

  if (url.searchParams.get("spike")) {
    return new Response("Approved in the PayPal sandbox. You can close this tab and continue the spike.", { headers: { "Content-Type": "text/plain" } });
  }
  if (!orderId) {
    back.searchParams.set("paypal", "missing-order");
    return Response.redirect(back, 303);
  }
  try {
    const result = await handlePayerReturn(await getDb(), orderId);
    back.searchParams.set("paypal", result.kind === "allowance" ? "allowance-approved" : "transfer-approved");
  } catch (error) {
    console.error(error);
    back.searchParams.set("paypal", "error");
  }
  return Response.redirect(back, 303);
}
