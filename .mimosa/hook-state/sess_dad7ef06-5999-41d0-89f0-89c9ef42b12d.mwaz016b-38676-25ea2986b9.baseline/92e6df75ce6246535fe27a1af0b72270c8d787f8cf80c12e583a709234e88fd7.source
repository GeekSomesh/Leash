// Day-1 go/no-go test for the PayPal sandbox. It checks, against YOUR sandbox app, every
// PayPal capability Leash depends on:
//   1. an AUTHORIZE order the buyer approves (the allowance hold)
//   2. two partial captures from one authorization (one allowance pays for many purchases)
//   3. a partial refund
//   4. voiding the rest of the hold
//   5. a Payout to a sandbox email (settling with merchants and people)
//
//   npm run paypal:spike               creates the order and prints the approval link
//   npm run paypal:spike -- continue   after you approve it: runs steps 1-5
//
// In an interactive terminal the first command waits for Enter and carries on by itself.
// Only sandbox money moves. You approve the order yourself in the browser with a sandbox
// PERSONAL (buyer) account; the script never handles any password.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { PayPalApiError } from "@/lib/paypal/client";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  createPayout,
  getOrderStatus,
  getPayoutBatch,
  refundCapture,
  voidAuthorization,
} from "@/lib/paypal/payments";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already in the environment.
}

const STATE_FILE = ".data/paypal-spike.json";
type SpikeState = { runId: string; orderId: string; approveUrl: string; createdAt: string };

type Result = { step: string; ok: boolean; detail: string };
const results: Result[] = [];

async function step<T>(name: string, run: () => Promise<T>, describe: (value: T) => string): Promise<T | undefined> {
  process.stdout.write(`- ${name} ... `);
  try {
    const value = await run();
    const detail = describe(value);
    console.log(`OK  ${detail}`);
    results.push({ step: name, ok: true, detail });
    return value;
  } catch (error) {
    const detail =
      error instanceof PayPalApiError
        ? `${error.status} ${error.issue ?? ""} (debug id ${error.debugId ?? "n/a"})`
        : error instanceof Error
          ? error.message
          : String(error);
    console.log(`FAILED  ${detail}`);
    results.push({ step: name, ok: false, detail });
    return undefined;
  }
}

async function start() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const runId = `spike-${Date.now()}`;

  const order = await step(
    "Create a $25.00 AUTHORIZE order",
    () =>
      createAuthorizeOrder({
        amountCents: 2500,
        description: "Leash sandbox spike: allowance hold",
        referenceId: runId,
        returnUrl: `${baseUrl}/paypal/return?spike=1`,
        cancelUrl: `${baseUrl}/paypal/cancel?spike=1`,
        requestId: `${runId}-order`,
      }),
    (o) => `order ${o.orderId}`,
  );
  if (!order) return summary();

  const state: SpikeState = { runId, orderId: order.orderId, approveUrl: order.approveUrl, createdAt: new Date().toISOString() };
  mkdirSync(".data", { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log(`\n  Approve it with a SANDBOX PERSONAL account (developer.paypal.com > Testing Tools > Sandbox Accounts):\n\n  ${order.approveUrl}\n`);
  console.log(`  PayPal then sends you to ${baseUrl}/paypal/return. If the app isn't running, that page won't load,`);
  console.log("  which is fine: the approval is already recorded.\n");

  if (!process.stdin.isTTY) {
    console.log("  Then run:  npm run paypal:spike -- continue\n");
    return;
  }
  const rl = createInterface({ input, output });
  await rl.question("  Press Enter once you've approved it... ");
  rl.close();
  await finish(state);
}

async function finish(state: SpikeState) {
  const { runId, orderId } = state;
  const payoutReceiver = process.env.DEMO_MERCHANT_FRESHCART_EMAIL || process.env.SPIKE_PAYOUT_RECEIVER_EMAIL;

  const status = await step("Check the order was approved", () => getOrderStatus(orderId), (s) => s);
  if (status !== "APPROVED") {
    console.log(`\n  The order is ${status ?? "unknown"}, not APPROVED. Approve it at:\n  ${state.approveUrl}\n  then run: npm run paypal:spike -- continue`);
    return summary();
  }

  const auth = await step(
    "Authorize the order (place the hold)",
    () => authorizeOrder(orderId, `${runId}-authorize`),
    (a) => `authorization ${a.authorizationId}, ${a.status}, expires ${a.expirationTime ?? "n/a"}`,
  );
  if (!auth) return summary();

  const first = await step(
    "Partial capture #1: $5.00 (final_capture: false)",
    () => captureAuthorization(auth.authorizationId, { amountCents: 500, finalCapture: false, invoiceId: `${runId}-c1`, requestId: `${runId}-c1` }),
    (c) => `capture ${c.captureId}, ${c.status}`,
  );
  await step(
    "Partial capture #2: $3.00 from the same hold",
    () => captureAuthorization(auth.authorizationId, { amountCents: 300, finalCapture: false, invoiceId: `${runId}-c2`, requestId: `${runId}-c2` }),
    (c) => `capture ${c.captureId}, ${c.status}`,
  );
  if (first) {
    await step(
      "Refund $1.00 of capture #1",
      () => refundCapture(first.captureId, { amountCents: 100, noteToPayer: "Leash sandbox spike refund", requestId: `${runId}-refund` }),
      (r) => `refund ${r.refundId}, ${r.status}`,
    );
  }
  await step("Void the rest of the hold", () => voidAuthorization(auth.authorizationId, `${runId}-void`), (v) => v.status);

  if (payoutReceiver) {
    const payout = await step(
      `Payout $2.00 to ${payoutReceiver}`,
      () =>
        createPayout({
          senderBatchId: `${runId}-payout`,
          emailSubject: "Leash sandbox spike payout",
          items: [{ receiverEmail: payoutReceiver, amountCents: 200, note: "Leash sandbox spike", senderItemId: `${runId}-p1` }],
        }),
      (p) => `batch ${p.batchId}, ${p.batchStatus}`,
    );
    if (payout) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await step("Check the payout batch", () => getPayoutBatch(payout.batchId), (b) => `${b.batchStatus}; items: ${b.itemStatuses.join(", ") || "none yet"}`);
    }
  } else {
    console.log("- Payout: skipped (set DEMO_MERCHANT_FRESHCART_EMAIL to a sandbox account email to test it)");
  }

  summary();
}

function summary() {
  console.log("\nSummary");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.step}  (${r.detail})`);
  const failed = results.filter((r) => !r.ok).map((r) => r.step);
  if (failed.some((s) => s.startsWith("Partial capture #2"))) {
    console.log("\n  Multiple captures failed. Fallback: capture the whole allowance up front and refund the unused part at the end of the week.");
  }
  if (failed.some((s) => s.startsWith("Payout"))) {
    console.log("\n  Payouts failed. Ask in the PayPal Discord whether Payouts can be enabled for your sandbox app.");
  }
  if (results.length > 0 && failed.length === 0) console.log("\n  Every step passed.");
}

async function main() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first (see .env.example).");
    process.exit(1);
  }
  console.log("\nLeash PayPal sandbox spike\n");

  if (process.argv.includes("continue")) {
    let state: SpikeState;
    try {
      state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as SpikeState;
    } catch {
      console.error(`No spike in progress (${STATE_FILE} is missing). Run: npm run paypal:spike`);
      process.exit(1);
    }
    await finish(state);
  } else {
    await start();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
