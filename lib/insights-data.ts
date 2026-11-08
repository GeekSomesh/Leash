// The shapes /api/insights returns and the insights dashboard renders. Kept free of server
// imports so the dashboard (a client component) can import the types.

import type { Check } from "@/lib/domain/schemas";

export type InsightsPayment = {
  id: string;
  createdAt: string;
  agentName: string;
  agentKind: string;
  ownerName: string;
  kind: "purchase" | "transfer";
  payeeName: string;
  totalCents: number;
  outcome: "approve" | "hold" | "block";
  status: string;
  simulated: boolean;
};

export type InsightsCheck = {
  paymentId: string;
  createdAt: string;
  agentName: string;
  payeeName: string;
  totalCents: number;
} & Pick<Check, "id" | "label" | "source" | "status" | "detail">;

export type InsightsLedger = {
  type: string;
  amountCents: number;
  status: string;
  paypalId: string | null;
  simulated: boolean;
  createdAt: string;
};

export type InsightsAllowance = {
  id: string;
  amountCents: number;
  capturedCents: number;
  status: string;
  simulated: boolean;
  periodEnd: string;
};

export type InsightsAgent = {
  id: string;
  name: string;
  kind: string;
  ownerName: string;
  paidCents: number;
  paymentCount: number;
};

export type InsightsData = {
  payments: InsightsPayment[];
  checks: InsightsCheck[];
  ledger: InsightsLedger[];
  allowances: InsightsAllowance[];
  agents: InsightsAgent[];
};
