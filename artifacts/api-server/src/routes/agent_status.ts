import { Router, type IRouter } from "express";
import { agentRequest, isAgentConfigured } from "../lib/agent";

const router: IRouter = Router();

const AGENT_URL = process.env["AGENT_URL"] ?? null;

interface AgentInfoResponse {
  version?: string;
  hostInfo?: string;
}

/** GET /api/agent/status */
router.get("/agent/status", async (_req, res): Promise<void> => {
  if (!isAgentConfigured()) {
    res.json({
      connected: false,
      agentUrl: null,
      version: null,
      hostInfo: null,
    });
    return;
  }

  const resp = await agentRequest<AgentInfoResponse>("/info", { timeoutMs: 4000 });

  res.json({
    connected: resp.ok,
    agentUrl: AGENT_URL,
    version: resp.ok ? (resp.data.version ?? null) : null,
    hostInfo: resp.ok ? (resp.data.hostInfo ?? null) : null,
  });
});

export default router;
