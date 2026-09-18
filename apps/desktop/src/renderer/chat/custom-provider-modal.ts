/**
 * 「添加自定义供应商」向导 — XYAI 天蓝主题。
 * 对标开源桌面 Agent 添加供应商流程（产品文案仅使用 XYAI）。
 */

import type { CustomProvider } from '../types-custom-provider.js';

export type CustomProviderModalOutcome =
  | { action: 'save'; provider: CustomProvider }
  | { action: 'cancel' };

type AuthTab = 'apiKey' | 'oauth' | 'none';
type Runtime = 'claude-code' | 'codex' | 'pi';
type Protocol = 'openai-responses' | 'chat-completions' | 'anthropic-messages';
type ModelRow = { id: string; label: string; contextTokens: string };
type HeaderRow = { name: string; value: string };

type Preset = {
  id: string;
  name: string;
  baseUrl: string;
  protocol: Protocol;
  auth: AuthTab;
  runtime: Runtime;
  models: ModelRow[];
};

const PRESETS: Preset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', contextTokens: '65536' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextTokens: '65536' },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [{ id: 'qwen-plus', label: 'Qwen Plus', contextTokens: '131072' }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-responses',
    auth: 'apiKey',
    runtime: 'codex',
    models: [{ id: 'gpt-4o', label: 'GPT-4o', contextTokens: '128000' }],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic-messages',
    auth: 'apiKey',
    runtime: 'claude-code',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', contextTokens: '200000' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'chat-completions',
    auth: 'none',
    runtime: 'codex',
    models: [],
  },
  {
    id: 'custom',
    name: '自定义端点',
    baseUrl: '',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [{ id: '', label: '', contextTokens: '' }],
  },
];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type CustomProviderModalOptions = {
  initial?: CustomProvider | null;
  onTest?: (draft: CustomProvider) => Promise<{ ok: boolean; message: string }>;
  onFetchModels?: (draft: CustomProvider) => Promise<{
    ok: boolean;
    message: string;
    models?: { id: string; label: string }[];
  }>;
};

export function openCustomProviderModal(
  opts: CustomProviderModalOptions = {},
): Promise<CustomProviderModalOutcome> {
  return new Promise((resolve) => {
    const initial = opts.initial ?? null;
    let step: 'preset' | 'form' = initial ? 'form' : 'preset';
    let auth: AuthTab = (initial?.auth as AuthTab) || 'apiKey';
    let runtime: Runtime = (initial?.runtime as Runtime) || 'codex';
    let protocol: Protocol =
      (initial?.protocol as Protocol) || 'chat-completions';
    let showKey = false;
    let modelRows: ModelRow[] = (initial?.models || []).map((m) => ({
      id: m.id,
      label: m.label,
      contextTokens: m.contextTokens != null ? String(m.contextTokens) : '',
    }));
    if (!modelRows.length) modelRows = [{ id: '', label: '', contextTokens: '' }];
    let headerRows: HeaderRow[] = (initial?.headers || []).map((x) => ({
      name: x.name,
      value: x.value,
    }));

    const overlay = h('div', 'cp-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '添加自定义供应商');

    const card = h('div', 'cp-modal');
    const title = h(
      'h2',
      'cp-title',
      initial ? '编辑自定义供应商' : '添加自定义供应商',
    );
    const body = h('div', 'cp-body');
    const status = h('div', 'cp-status');
    const footer = h('div', 'cp-footer');
    card.append(title, body, status, footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const nameInput = h('input', 'cp-input') as HTMLInputElement;
    nameInput.type = 'text';
    nameInput.placeholder = '例如 DeepSeek';
    nameInput.value = initial?.name || '';

    const baseInput = h('input', 'cp-input') as HTMLInputElement;
    baseInput.type = 'text';
    baseInput.placeholder = 'https://api.example.com/v1';
    baseInput.value = initial?.baseUrl || '';

    const pathInput = h('input', 'cp-input') as HTMLInputElement;
    pathInput.type = 'text';
    pathInput.placeholder = '可选，如 /chat/completions';
    pathInput.value = initial?.requestPath || '';

    const keyInput = h('input', 'cp-input') as HTMLInputElement;
    keyInput.type = 'password';
    keyInput.placeholder = 'sk-…';
    keyInput.value = initial?.apiKey || '';

    function setStatus(msg: string, kind: 'ok' | 'err' | '' = ''): void {
      status.textContent = msg;
      status.className = 'cp-status' + (kind ? ` is-${kind}` : '');
    }

    function readDraft(): CustomProvider {
      const models = modelRows
        .map((r) => {
          const id = r.id.trim();
          const label = (r.label || id).trim() || id;
          const n = r.contextTokens.trim() ? Number(r.contextTokens.trim()) : NaN;
          return {
            id,
            label,
            ...(Number.isFinite(n) && n > 0 ? { contextTokens: Math.floor(n) } : {}),
          };
        })
        .filter((m) => m.id);
      const headers = headerRows
        .map((r) => ({ name: r.name.trim(), value: r.value }))
        .filter((r) => r.name);
      return {
        id: initial?.id || `cp_${Date.now().toString(36)}`,
        name: nameInput.value.trim() || '未命名供应商',
        runtime,
        auth,
        protocol,
        baseUrl: baseInput.value.trim(),
        ...(pathInput.value.trim() ? { requestPath: pathInput.value.trim() } : {}),
        ...(keyInput.value ? { apiKey: keyInput.value } : {}),
        headers,
        models,
      };
    }

    function finish(outcome: CustomProviderModalOutcome): void {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(outcome);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') finish({ action: 'cancel' });
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish({ action: 'cancel' });
    });

    function applyPreset(p: Preset): void {
      nameInput.value = p.name === '自定义端点' ? '' : p.name;
      baseInput.value = p.baseUrl;
      pathInput.value = '';
      keyInput.value = '';
      auth = p.auth;
      runtime = p.runtime;
      protocol = p.protocol;
      modelRows = p.models.length
        ? p.models.map((m) => ({ ...m }))
        : [{ id: '', label: '', contextTokens: '' }];
      headerRows = [];
      step = 'form';
      render();
    }

    function chips<T extends string>(
      label: string,
      options: { id: T; label: string; disabled?: boolean; title?: string }[],
      current: T,
      onPick: (id: T) => void,
    ): HTMLElement {
      const wrap = h('div', 'cp-field');
      wrap.appendChild(h('div', 'cp-label', label));
      const row = h('div', 'cp-chips');
      for (const opt of options) {
        const btn = h(
          'button',
          'cp-chip' + (opt.id === current ? ' is-on' : ''),
        ) as HTMLButtonElement;
        btn.type = 'button';
        btn.textContent = opt.label;
        if (opt.disabled) {
          btn.disabled = true;
          btn.classList.add('is-disabled');
          btn.title = opt.title || '暂未开放';
        }
        btn.addEventListener('click', () => {
          if (opt.disabled) return;
          onPick(opt.id);
          render();
        });
        row.appendChild(btn);
      }
      wrap.appendChild(row);
      return wrap;
    }

    function render(): void {
      body.innerHTML = '';
      footer.innerHTML = '';

      if (step === 'preset') {
        body.appendChild(
          h('p', 'cp-hint', '选择预设供应商，或从自定义端点开始配置。'),
        );
        const grid = h('div', 'cp-preset-grid');
        for (const p of PRESETS) {
          const btn = h('button', 'cp-preset-card') as HTMLButtonElement;
          btn.type = 'button';
          const strong = h('strong', '', p.name);
          const span = h('span', '', p.baseUrl || '手动填写 Base URL');
          btn.append(strong, span);
          btn.addEventListener('click', () => applyPreset(p));
          grid.appendChild(btn);
        }
        body.appendChild(grid);
        const cancel = h('button', 'cp-btn', '取消') as HTMLButtonElement;
        cancel.type = 'button';
        cancel.addEventListener('click', () => finish({ action: 'cancel' }));
        footer.appendChild(cancel);
        return;
      }

      const nameField = h('div', 'cp-field');
      nameField.append(h('div', 'cp-label', '供应商名称'), nameInput);
      body.appendChild(nameField);

      body.appendChild(
        chips(
          '鉴权方式',
          [
            { id: 'apiKey' as AuthTab, label: 'API 密钥' },
            {
              id: 'oauth' as AuthTab,
              label: 'OAuth 订阅授权（即将支持）',
              disabled: true,
              title: 'OAuth 订阅授权即将支持',
            },
            { id: 'none' as AuthTab, label: '无需鉴权' },
          ],
          auth,
          (id) => {
            auth = id;
          },
        ),
      );

      body.appendChild(
        chips(
          '运行时（XYAI 0.5 主 harness：Codex）',
          [
            { id: 'claude-code' as Runtime, label: 'Claude Code' },
            { id: 'codex' as Runtime, label: 'Codex' },
            { id: 'pi' as Runtime, label: 'Pi' },
          ],
          runtime,
          (id) => {
            runtime = id;
          },
        ),
      );

      body.appendChild(
        chips(
          '上游协议',
          [
            {
              id: 'openai-responses' as Protocol,
              label: 'OpenAI Responses（原生）',
            },
            {
              id: 'chat-completions' as Protocol,
              label: 'Chat Completions（XYAI 桥接）',
            },
            {
              id: 'anthropic-messages' as Protocol,
              label: 'Anthropic Messages（XYAI 桥接）',
            },
          ],
          protocol,
          (id) => {
            protocol = id;
          },
        ),
      );

      const baseField = h('div', 'cp-field');
      baseField.append(h('div', 'cp-label', 'Base URL'), baseInput);
      body.appendChild(baseField);

      const pathField = h('div', 'cp-field');
      pathField.append(h('div', 'cp-label', '精确请求路径（可选）'), pathInput);
      body.appendChild(pathField);

      if (auth === 'apiKey') {
        const keyField = h('div', 'cp-field');
        keyField.appendChild(h('div', 'cp-label', 'API Key'));
        const keyRow = h('div', 'cp-key-row');
        keyInput.type = showKey ? 'text' : 'password';
        const toggle = h(
          'button',
          'cp-btn ghost',
          showKey ? '隐藏' : '显示',
        ) as HTMLButtonElement;
        toggle.type = 'button';
        toggle.addEventListener('click', () => {
          showKey = !showKey;
          render();
        });
        keyRow.append(keyInput, toggle);
        keyField.appendChild(keyRow);
        body.appendChild(keyField);
      }

      const modelsField = h('div', 'cp-field');
      modelsField.appendChild(h('div', 'cp-label', '模型列表'));
      const modelsBox = h('div', 'cp-models');
      modelRows.forEach((row, idx) => {
        const line = h('div', 'cp-model-row');
        const idIn = h('input', 'cp-input') as HTMLInputElement;
        idIn.placeholder = '模型 ID';
        idIn.value = row.id;
        idIn.addEventListener('input', () => {
          modelRows[idx]!.id = idIn.value;
        });
        const labelIn = h('input', 'cp-input') as HTMLInputElement;
        labelIn.placeholder = '显示名称';
        labelIn.value = row.label;
        labelIn.addEventListener('input', () => {
          modelRows[idx]!.label = labelIn.value;
        });
        const ctxIn = h('input', 'cp-input') as HTMLInputElement;
        ctxIn.placeholder = '上下文 tokens';
        ctxIn.value = row.contextTokens;
        ctxIn.addEventListener('input', () => {
          modelRows[idx]!.contextTokens = ctxIn.value;
        });
        const rm = h('button', 'cp-icon-btn', '×') as HTMLButtonElement;
        rm.type = 'button';
        rm.title = '移除';
        rm.addEventListener('click', () => {
          modelRows.splice(idx, 1);
          if (!modelRows.length) {
            modelRows.push({ id: '', label: '', contextTokens: '' });
          }
          render();
        });
        line.append(idIn, labelIn, ctxIn, rm);
        modelsBox.appendChild(line);
      });
      modelsField.appendChild(modelsBox);
      const addModel = h('button', 'cp-btn ghost', '+ 添加模型') as HTMLButtonElement;
      addModel.type = 'button';
      addModel.addEventListener('click', () => {
        modelRows.push({ id: '', label: '', contextTokens: '' });
        render();
      });
      modelsField.appendChild(addModel);
      body.appendChild(modelsField);

      const headersField = h('div', 'cp-field');
      headersField.appendChild(h('div', 'cp-label', 'Request Headers（可选）'));
      const headersBox = h('div', 'cp-headers');
      headerRows.forEach((row, idx) => {
        const line = h('div', 'cp-header-row');
        const nameIn = h('input', 'cp-input') as HTMLInputElement;
        nameIn.placeholder = 'Header 名';
        nameIn.value = row.name;
        nameIn.addEventListener('input', () => {
          headerRows[idx]!.name = nameIn.value;
        });
        const valIn = h('input', 'cp-input') as HTMLInputElement;
        valIn.placeholder = '值';
        valIn.value = row.value;
        valIn.addEventListener('input', () => {
          headerRows[idx]!.value = valIn.value;
        });
        const rm = h('button', 'cp-icon-btn', '×') as HTMLButtonElement;
        rm.type = 'button';
        rm.addEventListener('click', () => {
          headerRows.splice(idx, 1);
          render();
        });
        line.append(nameIn, valIn, rm);
        headersBox.appendChild(line);
      });
      headersField.appendChild(headersBox);
      const addHeader = h(
        'button',
        'cp-btn ghost',
        '+ 添加 Header',
      ) as HTMLButtonElement;
      addHeader.type = 'button';
      addHeader.addEventListener('click', () => {
        headerRows.push({ name: '', value: '' });
        render();
      });
      headersField.appendChild(addHeader);
      body.appendChild(headersField);

      const left = h('div', 'cp-footer-left');
      const right = h('div', 'cp-footer-right');

      const testBtn = h('button', 'cp-btn', '测试连接') as HTMLButtonElement;
      testBtn.type = 'button';
      testBtn.addEventListener('click', () => {
        void (async () => {
          const draft = readDraft();
          if (!draft.baseUrl) {
            setStatus('请填写 Base URL', 'err');
            return;
          }
          setStatus('测试中…');
          try {
            const fn = opts.onTest || window.xyai?.testCustomProvider;
            if (!fn) {
              setStatus('测试接口不可用', 'err');
              return;
            }
            const res = await fn(draft);
            setStatus(res.message, res.ok ? 'ok' : 'err');
          } catch (err) {
            setStatus(String(err), 'err');
          }
        })();
      });

      const fetchBtn = h('button', 'cp-btn', '获取模型列表') as HTMLButtonElement;
      fetchBtn.type = 'button';
      fetchBtn.addEventListener('click', () => {
        void (async () => {
          const draft = readDraft();
          if (!draft.baseUrl) {
            setStatus('请填写 Base URL', 'err');
            return;
          }
          setStatus('获取模型列表中…');
          try {
            const fn =
              opts.onFetchModels || window.xyai?.fetchCustomProviderModels;
            if (!fn) {
              setStatus('获取模型接口不可用', 'err');
              return;
            }
            const res = await fn(draft);
            if (!res.ok) {
              setStatus(res.message, 'err');
              return;
            }
            if (res.models?.length) {
              const existing = new Set(
                modelRows.map((m) => m.id.trim()).filter(Boolean),
              );
              for (const m of res.models) {
                if (existing.has(m.id)) continue;
                modelRows.push({
                  id: m.id,
                  label: m.label || m.id,
                  contextTokens: '',
                });
              }
              modelRows = modelRows.filter((m) => m.id.trim());
              if (!modelRows.length) {
                modelRows = [{ id: '', label: '', contextTokens: '' }];
              }
              render();
            }
            setStatus(res.message, 'ok');
          } catch (err) {
            setStatus(String(err), 'err');
          }
        })();
      });

      const back = h('button', 'cp-btn ghost', '返回预设') as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => {
        step = 'preset';
        render();
      });

      const cancel = h('button', 'cp-btn', '取消') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish({ action: 'cancel' }));

      const save = h('button', 'cp-btn primary', '保存') as HTMLButtonElement;
      save.type = 'button';
      save.addEventListener('click', () => {
        const draft = readDraft();
        if (!draft.name.trim()) {
          setStatus('请填写供应商名称', 'err');
          return;
        }
        if (!draft.baseUrl.trim()) {
          setStatus('请填写 Base URL', 'err');
          return;
        }
        if (!draft.models.length) {
          setStatus('请至少添加一个模型', 'err');
          return;
        }
        if (draft.auth === 'apiKey' && !(draft.apiKey || '').trim()) {
          setStatus('请填写 API Key（或改选「无需鉴权」）', 'err');
          return;
        }
        finish({ action: 'save', provider: draft });
      });

      left.append(testBtn, fetchBtn);
      right.append(back, cancel, save);
      footer.append(left, right);
    }

    render();
    nameInput.focus();
  });
}
