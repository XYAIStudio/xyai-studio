import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const workDir = await mkdtemp(path.join(tmpdir(), "xyos-credential-broker-"));
const brokerToken = "credential-broker-test-token";
const secrets = new Map<string, string>();
const modelRequests: Array<{ authorization?: string; model?: string }> = [];
const broker = createServer((req, res) => {
  if (req.headers["x-xyai-credential-token"] !== brokerToken) { res.writeHead(401).end(); return; }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname !== "/v1/credentials") { res.writeHead(404).end(); return; }
  if (req.method === "GET") {
    const secret = secrets.get(url.searchParams.get("name") || "");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ configured: Boolean(secret), ...(secret ? { secret } : {}) }));
    return;
  }
  if (req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const parsed = JSON.parse(body) as { name: string; secret: string };
      secrets.set(parsed.name, parsed.secret);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ configured: true }));
    });
    return;
  }
  res.writeHead(405).end();
});
const modelServer = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += String(chunk); });
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}") as { model?: string };
    modelRequests.push({ authorization: req.headers.authorization, model: parsed.model });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: parsed.model, choices: [{ message: { content: "broker-model-ok" } }], usage: { total_tokens: 3 } }));
  });
});

try {
  await new Promise<void>((resolve) => broker.listen(0, "127.0.0.1", resolve));
  const brokerAddress = broker.address();
  assert.ok(brokerAddress && typeof brokerAddress === "object");
  process.env.XYAI_CREDENTIAL_BROKER_URL = `http://127.0.0.1:${brokerAddress.port}`;
  process.env.XYAI_CREDENTIAL_BROKER_TOKEN = brokerToken;
  process.env.DATABASE_PATH = path.join(workDir, "xyos.db");
  process.env.AIR_GAP_MODE = "false";
  process.env.JWT_SECRET = "xyos-credential-broker-jwt-secret-0123456789";
  process.env.COOKIE_SECRET = "xyos-credential-broker-cookie-secret-0123456789";
  await new Promise<void>((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
  const modelAddress = modelServer.address();
  assert.ok(modelAddress && typeof modelAddress === "object");
  const modelBase = `http://127.0.0.1:${modelAddress.port}/v1`;

  const { initDatabase, dbGet } = await import("../db");
  await initDatabase();
  const { settingsRoutes } = await import("../routes/settings");
  const { signToken } = await import("../middleware");
  const app = express();
  app.use(express.json());
  app.use("/api/settings", settingsRoutes);
  const apiServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const apiAddress = apiServer.address();
    assert.ok(apiAddress && typeof apiAddress === "object");
    const apiBase = `http://127.0.0.1:${apiAddress.port}`;
    const token = signToken({ id: 101, email: "vault@example.test", nickname: "Vault", role: "admin", tenant_id: 1 });
    const saved = await fetch(`${apiBase}/api/settings/ai`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ configs: { llm_api_base: modelBase, llm_api_key: "vault-only-key", llm_model: "vault-model" } }),
    });
    assert.equal(saved.status, 200);
    assert.equal(secrets.get("xyos:tenant:1:llm_api_key"), "vault-only-key");
    assert.equal(dbGet("SELECT value FROM ai_config WHERE key = ?", ["tenant:1:llm_api_key"]), undefined);
    const read = await fetch(`${apiBase}/api/settings/ai`, { headers: { authorization: `Bearer ${token}` } });
    const readBody = await read.json() as { data: { llm_api_key: string; llm_api_key_configured: boolean } };
    assert.equal(readBody.data.llm_api_key, "");
    assert.equal(readBody.data.llm_api_key_configured, true);
    const { callLLM } = await import("../services/ai");
    const result = await callLLM([{ role: "user", content: "verify broker key" }], 0, 16, 1);
    assert.equal(result.content, "broker-model-ok");
    assert.deepEqual(modelRequests, [{ authorization: "Bearer vault-only-key", model: "vault-model" }]);
  } finally {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  }
  console.log("XYOS model settings store API keys in the desktop credential broker and all XYOS calls use that tenant key.");
} finally {
  await new Promise<void>((resolve) => broker.close(() => resolve()));
  await new Promise<void>((resolve) => modelServer.close(() => resolve()));
  await rm(workDir, { recursive: true, force: true });
}
