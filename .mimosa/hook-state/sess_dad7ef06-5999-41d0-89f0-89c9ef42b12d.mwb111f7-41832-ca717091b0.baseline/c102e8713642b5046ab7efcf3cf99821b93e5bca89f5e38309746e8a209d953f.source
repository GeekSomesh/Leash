// Connects to a running Leash app over MCP, exactly as an AI agent would, and runs the
// gift agent's two purchases: the telescope (approved) and the poisoned listing (blocked).
//
//   npm run dev            (in another terminal)
//   npm run mcp:smoke
//
// Note: this resets the demo data to get fresh agent tokens.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { injectedGiftCardPurchase, telescopePurchase } from "@/lib/demo/fixtures";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Optional.
}

// The base URL is the operator's APP_BASE_URL (the app under test). Validate it before any
// request is built from it: only http(s) is allowed.
const base = (() => {
  const url = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`APP_BASE_URL must be an http(s) URL, got "${url.protocol}".`);
  }
  return url.toString().replace(/\/$/, "");
})();

function textOf(result: { content?: unknown }): string {
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return content.map((c) => c.text ?? "").join("\n");
}

async function main() {
  const unauthenticated = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  console.log(`Without a token the MCP endpoint answers ${unauthenticated.status} (expected 401).`);

  // The demo reset is protected when LEASH_ADMIN_SECRET is set on the target app.
  const adminHeaders: Record<string, string> = process.env.LEASH_ADMIN_SECRET ? { "x-admin-secret": process.env.LEASH_ADMIN_SECRET } : {};
  const reset = await fetch(`${base}/api/demo/reset`, { method: "POST", headers: adminHeaders });
  if (!reset.ok) throw new Error(`Couldn't reset the demo: ${reset.status} ${await reset.text()}`);
  const { tokens } = (await reset.json()) as { tokens: Record<string, string> };
  const token = tokens["agent-gift"];
  if (!token) throw new Error("No token for the gift agent.");

  // AI-backed reviews can take over a minute on a free model, so each callTool below carries
  // its own timeout (the SDK's default is 60 s; the constructor timeout only covers negotiation).
  const client = new Client({ name: "leash-smoke-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));

  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);

  // AI-backed reviews can take over a minute on a free model; the SDK's default is 60 s.
  const CALL_TIMEOUT = { timeout: 180_000 };

  console.log("\nget_spending_status:");
  console.log(textOf(await client.callTool({ name: "get_spending_status", arguments: {} }, CALL_TIMEOUT)));

  console.log("\nrequest_payment (telescope kit):");
  console.log(textOf(await client.callTool({ name: "request_payment", arguments: telescopePurchase() }, CALL_TIMEOUT)));

  console.log("\nrequest_payment (poisoned listing):");
  console.log(textOf(await client.callTool({ name: "request_payment", arguments: injectedGiftCardPurchase() }, CALL_TIMEOUT)));

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
