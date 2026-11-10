import type { Metadata } from "next";
import { connection } from "next/server";
import { aiConfigured } from "@/lib/ai/openrouter";
import { InsightsView } from "./insights-view";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  // Read the environment per request (not at build time): the licence key and whether the AI model is on.
  await connection();
  // AG Studio licence keys are meant to ship to the browser; the OpenRouter key never does.
  return <InsightsView licenseKey={process.env.AG_STUDIO || undefined} aiEnabled={aiConfigured()} />;
}
