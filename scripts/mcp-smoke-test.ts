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

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

function textOf(result: { content?: unknown }): string {
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return content.map((c) => c.text ?? "").join("\n");
}

async function main() {
  const unauthenticated = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  console.log(`Without a token the MCP endpoint answers ${unauthenticated.status} (expected 401).`);

  const reset = await fetch(`${base}/api/demo/reset`, { method: "POST" });
  if (!reset.ok) throw new Error(`Couldn't reset the demo: ${reset.status} ${await reset.text()}`);
  const { tokens } = (await reset.json()) as { tokens: Record<string, string> };
  const token = tokens["agent-gift"];
  if (!token) throw new Error("No token for the gift agent.");

  const client = new Client({ name: "leash-smoke-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));

  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);

  console.log("\nget_spending_status:");
  console.log(textOf(await client.callTool({ name: "get_spending_status", arguments: {} })));

  console.log("\nrequest_payment (telescope kit):");
  console.log(textOf(await client.callTool({ name: "request_payment", arguments: telescopePurchase() })));

  console.log("\nrequest_payment (poisoned listing):");
  console.log(textOf(await client.callTool({ name: "request_payment", arguments: injectedGiftCardPurchase() })));

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
