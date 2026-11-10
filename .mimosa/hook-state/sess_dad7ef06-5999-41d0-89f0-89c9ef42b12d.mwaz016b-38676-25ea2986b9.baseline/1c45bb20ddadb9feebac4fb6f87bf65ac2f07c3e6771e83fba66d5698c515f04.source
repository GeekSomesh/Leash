// Minimal PayPal REST client over fetch. Server-side only: it reads the client secret.
//
// Leash is a hackathon project built on the PayPal SANDBOX, so the base URL is fixed to the
// sandbox. There is deliberately no switch to live.

export const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
const MAX_ATTEMPTS = 4;

export type PayPalErrorDetail = { issue?: string; description?: string; field?: string };

export class PayPalApiError extends Error {
  readonly name = "PayPalApiError";
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly debugId: string | undefined,
    /** PayPal's error name, e.g. UNPROCESSABLE_ENTITY. */
    readonly errorName: string | undefined,
    readonly details: PayPalErrorDetail[],
    body: string,
  ) {
    super(`PayPal ${status} ${errorName ?? ""} on ${method} ${path}: ${body.slice(0, 400)}`);
  }

  /** The first specific issue code, e.g. AUTHORIZATION_ALREADY_CAPTURED. */
  get issue(): string | undefined {
    return this.details[0]?.issue ?? this.errorName;
  }
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set (see .env.example).");

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res, "POST", "/v1/oauth2/token");

  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so a request in flight never carries an expired token.
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

export type PayPalRequestOptions = {
  body?: unknown;
  /**
   * PayPal-Request-Id: makes a POST idempotent, so a retry after a timeout can never move money
   * twice. Every money-moving call must pass one.
   */
  requestId?: string;
};

export async function paypalRequest<T>(method: "GET" | "POST" | "PATCH", path: string, options: PayPalRequestOptions = {}): Promise<T> {
  // Without an idempotency key only reads are safe to retry.
  const retryable = method === "GET" || Boolean(options.requestId);

  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

    const res = await fetch(`${PAYPAL_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    }
    // An expired or revoked token: mint a new one once.
    if (res.status === 401 && attempt === 1) {
      cachedToken = undefined;
      continue;
    }
    if (retryable && (res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
      continue;
    }
    throw await toError(res, method, path);
  }
}

async function toError(res: Response, method: string, path: string): Promise<PayPalApiError> {
  const body = await res.text();
  let name: string | undefined;
  let details: PayPalErrorDetail[] = [];
  try {
    const parsed = JSON.parse(body) as { name?: string; error?: string; details?: PayPalErrorDetail[] };
    name = parsed.name ?? parsed.error;
    details = parsed.details ?? [];
  } catch {
    // Not JSON; keep the raw body in the message.
  }
  return new PayPalApiError(res.status, method, path, res.headers.get("paypal-debug-id") ?? undefined, name, details, body);
}

type Link = { href: string; rel: string; method?: string };

export function linkHref(links: Link[] | undefined, ...rels: string[]): string | undefined {
  return links?.find((link) => rels.includes(link.rel))?.href;
}
