/**
 * OpenAI-compatible HTTP helpers for custom providers (chat completions + /models).
 * Used by custom provider test / list / send path (Codex harness metadata; HTTP adapter).
 */

export type OpenAiCompatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type OpenAiCompatDelta = {
  text: string;
  done: boolean;
};

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  // Avoid duplicating /v1 when base already ends with it and path starts with /v1
  if (base.endsWith('/v1') && p.startsWith('/v1/')) {
    return `${base}${p.slice(3)}`;
  }
  return `${base}${p}`;
}

function buildHeaders(
  apiKey: string | undefined,
  extra: { name: string; value: string }[] | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = (apiKey || '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  for (const h of extra || []) {
    const n = (h.name || '').trim();
    if (!n) continue;
    headers[n] = h.value ?? '';
  }
  return headers;
}

export async function testOpenAiCompatConnection(options: {
  baseUrl: string;
  apiKey?: string;
  requestPath?: string;
  headers?: { name: string; value: string }[];
  signal?: AbortSignal;
}): Promise<{ ok: boolean; message: string }> {
  const base = (options.baseUrl || '').trim();
  if (!base) return { ok: false, message: '请填写 Base URL' };

  const headers = buildHeaders(options.apiKey, options.headers);
  const candidates = [
    options.requestPath?.trim() ? joinUrl(base, options.requestPath.trim()) : '',
    joinUrl(base, '/models'),
    base,
  ].filter(Boolean);

  let lastErr = '连接失败';
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: options.signal,
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        // 401/403 means endpoint reachable but auth issue
        if (res.ok) return { ok: true, message: `连接成功（HTTP ${res.status}）` };
        return {
          ok: false,
          message: `已连通但鉴权失败（HTTP ${res.status}），请检查 API 密钥`,
        };
      }
      // try POST models as fallback for odd gateways
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, message: `测试连接失败：${lastErr}` };
}

export async function listOpenAiCompatModels(options: {
  baseUrl: string;
  apiKey?: string;
  headers?: { name: string; value: string }[];
  signal?: AbortSignal;
}): Promise<{ ok: boolean; models: { id: string; label: string }[]; message: string }> {
  const base = (options.baseUrl || '').trim();
  if (!base) return { ok: false, models: [], message: '请填写 Base URL' };

  const url = joinUrl(base, '/models');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(options.apiKey, options.headers),
      signal: options.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        models: [],
        message: `获取模型列表失败（HTTP ${res.status}）${body ? ': ' + body.slice(0, 160) : ''}`,
      };
    }
    const json = (await res.json()) as { data?: unknown };
    const data = Array.isArray(json.data) ? json.data : [];
    const models: { id: string; label: string }[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const id = typeof (row as { id?: unknown }).id === 'string'
        ? (row as { id: string }).id.trim()
        : '';
      if (!id) continue;
      models.push({ id, label: id });
    }
    return {
      ok: true,
      models,
      message: models.length
        ? `已获取 ${models.length} 个模型`
        : '连接成功，但未返回模型列表（可手动添加）',
    };
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Stream chat.completions (SSE or JSON). Yields text deltas.
 * Supports DeepSeek / OpenAI-compatible gateways.
 */
export async function* streamOpenAiChatCompletions(options: {
  baseUrl: string;
  apiKey?: string;
  requestPath?: string;
  headers?: { name: string; value: string }[];
  model: string;
  messages: OpenAiCompatMessage[];
  signal?: AbortSignal;
}): AsyncGenerator<OpenAiCompatDelta> {
  const base = (options.baseUrl || '').trim();
  const model = (options.model || '').trim();
  if (!base || !model) {
    yield { text: '', done: true };
    return;
  }

  const path = (options.requestPath || '').trim() || '/chat/completions';
  const url = joinUrl(base, path);
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(options.apiKey, options.headers),
    body: JSON.stringify({
      model,
      stream: true,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Custom provider HTTP ${res.status}: ${body.slice(0, 240)}`);
  }
  if (!res.body) {
    throw new Error('Custom provider response missing body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    if (options.signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let payload = trimmed;
      if (payload.startsWith('data:')) {
        payload = payload.slice(5).trim();
      }
      if (payload === '[DONE]') {
        yield { text: '', done: true };
        return;
      }
      let parsed: {
        choices?: Array<{
          delta?: { content?: string | null };
          message?: { content?: string | null };
          finish_reason?: string | null;
        }>;
      };
      try {
        parsed = JSON.parse(payload) as typeof parsed;
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      const piece =
        (typeof choice?.delta?.content === 'string' && choice.delta.content) ||
        (typeof choice?.message?.content === 'string' && choice.message.content) ||
        '';
      if (piece) {
        yield { text: piece, done: false };
      }
      if (choice?.finish_reason) {
        yield { text: '', done: true };
        return;
      }
    }
  }
  yield { text: '', done: true };
}
