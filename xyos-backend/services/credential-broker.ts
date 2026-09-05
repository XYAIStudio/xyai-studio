/**
 * XYOS can request a secret only from the desktop-owned loopback vault.  The
 * renderer never receives the bridge capability and SQLite stores no new API
 * keys when the desktop broker is available.
 */
const brokerOrigin = process.env.XYAI_CREDENTIAL_BROKER_URL?.replace(/\/+$/u, "");
const brokerToken = process.env.XYAI_CREDENTIAL_BROKER_TOKEN;

export function hasDesktopCredentialBroker(): boolean {
  return Boolean(brokerOrigin && brokerToken);
}

function credentialName(tenantId: number): string {
  if (!Number.isInteger(tenantId) || tenantId < 1) throw new Error("invalid tenant id");
  return `xyos:tenant:${tenantId}:llm_api_key`;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!brokerOrigin || !brokerToken) throw new Error("desktop credential broker is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    return await fetch(`${brokerOrigin}${path}`, {
      ...init,
      headers: {
        "x-xyai-credential-token": brokerToken,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readTenantLlmCredential(tenantId: number): Promise<string | undefined> {
  if (!hasDesktopCredentialBroker()) return undefined;
  const response = await request(`/v1/credentials?name=${encodeURIComponent(credentialName(tenantId))}`);
  if (!response.ok) throw new Error(`credential broker rejected credential read (${response.status})`);
  const payload = await response.json() as { configured?: unknown; secret?: unknown };
  return payload.configured === true && typeof payload.secret === "string" ? payload.secret : undefined;
}

export async function writeTenantLlmCredential(tenantId: number, secret: string): Promise<void> {
  if (!hasDesktopCredentialBroker()) throw new Error("desktop credential broker is unavailable");
  const response = await request("/v1/credentials", {
    method: "PUT",
    body: JSON.stringify({ name: credentialName(tenantId), secret }),
  });
  if (!response.ok) throw new Error(`credential broker rejected credential write (${response.status})`);
}
