/**
 * Agent proxy — forwards requests to the Ubuntu server agent
 * via the Cloudflare Tunnel URL stored in AGENT_URL.
 *
 * Every request is authenticated with a shared AGENT_SECRET header.
 */
import { logger } from "./logger";

const AGENT_URL = process.env["AGENT_URL"] ?? "";
const AGENT_SECRET = process.env["AGENT_SECRET"] ?? "";

/**
 * True when BOTH AGENT_URL and AGENT_SECRET are configured with non-empty values.
 * Requiring both prevents accepting provisioning requests that would silently
 * fail at the agent because authentication is missing.
 */
export function isAgentConfigured(): boolean {
  return AGENT_URL.trim().length > 0 && AGENT_SECRET.trim().length > 0;
}

interface AgentRequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  timeoutMs?: number;
}

export interface AgentResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/** Make an authenticated request to the remote agent. */
export async function agentRequest<T = unknown>(
  path: string,
  options: AgentRequestOptions = {},
): Promise<AgentResponse<T>> {
  const { method = "GET", body, timeoutMs = 30_000 } = options;

  if (!AGENT_URL) {
    return { ok: false, status: 503, data: { error: "AGENT_URL not configured" } as T };
  }

  const url = `${AGENT_URL.replace(/\/$/, "")}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Secret": AGENT_SECRET,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let data: T;
    try {
      data = (await resp.json()) as T;
    } catch {
      data = {} as T;
    }

    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    logger.error({ err, path }, "Agent request failed");
    return { ok: false, status: 503, data: { error: "Agent unreachable" } as T };
  } finally {
    clearTimeout(timer);
  }
}
