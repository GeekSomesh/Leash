export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("spike")) {
    return new Response("Cancelled in the PayPal sandbox. Run the spike again to retry.", { headers: { "Content-Type": "text/plain" } });
  }
  const back = new URL("/", url);
  back.searchParams.set("paypal", "cancelled");
  return Response.redirect(back, 303);
}
