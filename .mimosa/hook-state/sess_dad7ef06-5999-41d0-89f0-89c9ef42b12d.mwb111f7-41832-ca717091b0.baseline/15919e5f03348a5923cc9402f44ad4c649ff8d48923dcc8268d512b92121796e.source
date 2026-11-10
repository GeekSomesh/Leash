import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

/** A bearer token for an agent's MCP connection. Shown once; only its hash is stored. */
export const newAgentToken = () => `lsh_${randomBytes(24).toString("base64url")}`;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Ids for PayPal objects Leash simulates when no PayPal sandbox keys are configured. */
export const simulatedPayPalId = (kind: string) => `SIM-${kind}-${randomUUID().slice(0, 8).toUpperCase()}`;
