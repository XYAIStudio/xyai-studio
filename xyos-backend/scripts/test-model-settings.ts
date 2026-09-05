import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const workDir = await mkdtemp(path.join(tmpdir(), "xyos-model-settings-"));
process.env.DATABASE_PATH = path.join(workDir, "xyos.db");
process.env.AIR_GAP_MODE = "false";
process.env.JWT_SECRET = "xyos-model-settings-test-jwt-secret-0123456789";
process.env.COOKIE_SECRET = "xyos-model-settings-test-cookie-secret-0123456789";

const requests: Array<{ authorization?: string; model?: string }> = [];
const modelServer = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += String(chunk); });
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    requests.push({ authorization: req.headers.authorization, model: parsed.model });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: parsed.model, choices: [{ message: { content: `ok:${parsed.model}` } }], usage: { total_tokens: 7 } }));
  });
});

try {
  await new Promise<void>((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
  const address = modelServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  const { initDatabase, dbRun } = await import("../db");
  await initDatabase();
  dbRun(`INSERT OR REPLACE INTO tenants (id, name, slug, tenant_code, status, plan)
    VALUES (2, '模型设置测试租户', 'model-settings-test', 'MSTEST', 'active', 'basic')`);
  for (const [tenantId, key, value] of [
    [1, "llm_api_base", baseUrl], [1, "llm_api_key", "tenant-one-key"], [1, "llm_model", "tenant-one-model"],
    [2, "llm_api_base", baseUrl], [2, "llm_api_key", "tenant-two-key"], [2, "llm_model", "tenant-two-model"],
  ] as Array<[number, string, string]>) {
    dbRun("INSERT OR REPLACE INTO ai_config (key, value, tenant_id) VALUES (?, ?, ?)", [`tenant:${tenantId}:${key}`, value, tenantId]);
  }

  const { callLLM } = await import("../services/ai");
  const first = await callLLM([{ role: "user", content: "tenant one" }], 0, 32, 1);
  const second = await callLLM([{ role: "user", content: "tenant two" }], 0, 32, 2);
  assert.equal(first.content, "ok:tenant-one-model");
  assert.equal(second.content, "ok:tenant-two-model");
  assert.deepEqual(requests, [
    { authorization: "Bearer tenant-one-key", model: "tenant-one-model" },
    { authorization: "Bearer tenant-two-key", model: "tenant-two-model" },
  ]);

  // 验证系统设置的读取优先级与右下角助手的同租户调用。裸 key 是 v0.3
  // 历史数据，必须不能覆盖新版 tenant:<id>: key。
  dbRun("INSERT OR REPLACE INTO ai_config (key, value, tenant_id) VALUES (?, ?, ?)", ["llm_model", "legacy-model", 1]);
  const { settingsRoutes } = await import("../routes/settings");
  const { assistantRoutes } = await import("../routes/assistant");
  const { signToken } = await import("../middleware");
  const app = express();
  app.use(express.json());
  app.use("/api/settings", settingsRoutes);
  app.use("/api/assistant", assistantRoutes);
  const apiServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const apiAddress = apiServer.address();
    assert.ok(apiAddress && typeof apiAddress === "object");
    const apiBase = `http://127.0.0.1:${apiAddress.port}`;
    const tenantOneToken = signToken({ id: 101, email: "one@example.test", nickname: "Tenant One", role: "admin", tenant_id: 1 });
    const tenantTwoToken = signToken({ id: 102, email: "two@example.test", nickname: "Tenant Two", role: "admin", tenant_id: 2 });
    const settingsResponse = await fetch(`${apiBase}/api/settings/ai`, {
      headers: { Authorization: `Bearer ${tenantOneToken}` },
    });
    const settingsBody = await settingsResponse.json() as any;
    assert.equal(settingsBody.data.llm_model, "tenant-one-model");
    assert.equal(settingsBody.data.llm_api_key, "");
    assert.equal(settingsBody.data.llm_api_key_configured, true);

    const assistantResponse = await fetch(`${apiBase}/api/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tenantTwoToken}` },
      body: JSON.stringify({ message: "请用模型回复", history: [], session_id: "tenant-two-assistant" }),
    });
    const assistantBody = await assistantResponse.json() as any;
    assert.equal(assistantResponse.status, 200);
    assert.equal(assistantBody.reply, "ok:tenant-two-model");
    assert.deepEqual(requests.at(-1), { authorization: "Bearer tenant-two-key", model: "tenant-two-model" });
  } finally {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  }

  console.log("XYOS saved model settings select each tenant's API key and model, including the authenticated floating assistant.");
} finally {
  await new Promise<void>((resolve) => modelServer.close(() => resolve()));
  await rm(workDir, { recursive: true, force: true });
}
