import type { Metadata } from "next";
import { ApproveView } from "./approve-view";

export const metadata: Metadata = { title: "Approve a payment" };

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApproveView id={id} />;
}
