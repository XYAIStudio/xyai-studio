/**
 * Renderer assembler — 0.3 chrome + models hub; chat lives under ./chat/.
 */

import { fillModelSelect, mountChat, type XyaiStatus } from './chat/index.js';
import { openCustomProviderModal } from './chat/custom-provider-modal.js';
import type { CustomProvider } from './types-custom-provider.js';
import { mountKnowledgePanel } from './knowledge/panel.js';
import { mountPersonalizePanel } from './personalize/panel.js';
import { LOGO_SRC } from './chat/mascot.js';
import { showAboutDialog } from './about.js';
import { mountBizZone, mountEcoZone, mountBrowserZone } from './zones/index.js';
import { formatLocalModelScanResult } from './models-scan-copy.js';

let pulling = false;

const statusEl = document.getElementById('status') as HTMLElement | null;
const settingsModel = document.getElementById('settings-model') as HTMLSelectElement;
const settingsForceMock = document.getElementById(
  'settings-force-mock',
) as HTMLInputElement;
const settingsCodexBin = document.getElementById(
  'settings-codex-bin',
) as HTMLInputElement;
const cloudProvidersEl = document.getElementById(
  'cloud-providers',
) as HTMLElement;
const hwPanel = document.getElementById('hw-panel') as HTMLElement;
const depPanel = document.getElementById('dep-panel') as HTMLElement;
const installedList = document.getElementById('installed-list') as HTMLElement;
const recList = document.getElementById('rec-list') as HTMLElement;
const embedList = document.getElementById('embed-list') as HTMLElement;
const pullLog = document.getElementById('pull-log') as HTMLPreElement;
const btnRefresh = document.getElementById(
  'btn-refresh-models',
) as HTMLButtonElement;
const btnInstall = document.getElementById(
  'btn-install-ollama',
) as HTMLButtonElement;
const btnStartOllama = document.getElementById(
  'btn-start-ollama',
) as HTMLButtonElement | null;

let lastOllama = {
  installed: false,
  running: false,
};

let hwPollTimer: number | null = null;
let modelsTabVisible = false;

function stopHwPoll(): void {
  if (hwPollTimer != null) {
    window.clearInterval(hwPollTimer);
    hwPollTimer = null;
  }
}

function renderUsageLine(usage: {
  ramUsedMb: number;
  ramTotalMb: number;
  ramUsedPct: number;
  gpus: {
    name: string;
    vramUsedMb: number | null;
    vramTotalMb: number | null;
    vramUsedPct: number | null;
    utilizationPct: number | null;
  }[];
  pressure: string;
  gpuAccelHint?: string;
}): void {
  let box = document.getElementById('hw-usage');
  if (!box) {
    box = document.createElement('div');
    box.id = 'hw-usage';
    hwPanel.appendChild(box);
  }
  const gpuLines = (usage.gpus || [])
    .map((g) => {
      const vram =
        g.vramUsedMb != null && g.vramTotalMb != null
          ? `显存 ${(g.vramUsedMb / 1024).toFixed(1)}/${(g.vramTotalMb / 1024).toFixed(1)} GB（${g.vramUsedPct ?? 0}%）`
          : '显存使用率暂不可用';
      const util =
        g.utilizationPct != null ? ` · 利用率 ${g.utilizationPct}%` : '';
      return `<div class="hw-line">GPU ${g.name}：${vram}${util}</div>`;
    })
    .join('');
  const warn =
    usage.pressure === 'critical'
      ? '<div class="hw-line hw-warn">显存/内存压力过高，已限制新的大模型拉取。</div>'
      : usage.pressure === 'elevated'
        ? '<div class="hw-line hw-warn">资源占用较高，建议优先小模型。</div>'
        : '';
  const hint = usage.gpuAccelHint
    ? `<div class="hw-line meta">${usage.gpuAccelHint}</div>`
    : '';
  box.innerHTML = `
    <div class="hw-line">内存实时：${(usage.ramUsedMb / 1024).toFixed(1)} / ${(usage.ramTotalMb / 1024).toFixed(1)} GB（${usage.ramUsedPct}%）</div>
    ${gpuLines}
    ${warn}
    ${hint}
  `;
}

async function tickHardwareUsage(): Promise<void> {
  if (!modelsTabVisible || !window.xyai.hardwareUsage) return;
  try {
    const usage = await window.xyai.hardwareUsage();
    renderUsageLine(usage);
  } catch {
    /* ignore poll errors */
  }
}

function startHwPoll(): void {
  modelsTabVisible = true;
  void tickHardwareUsage();
  stopHwPoll();
  hwPollTimer = window.setInterval(() => {
    void tickHardwareUsage();
  }, 1500);
}

const CLOUD_META: { id: string; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'anthropic', label: 'Anthropic' },
];

function renderStatusChip(st: XyaiStatus): void {
  if (!statusEl) return; // chrome status removed
  const mode = st.isMock ? 'MOCK' : 'REAL';
  const src = st.binarySource || 'none';
  const path = st.binaryPath ? st.binaryPath.split(/[/\\]/).pop() : '—';
  statusEl.textContent = `${mode} · ${src} · ${path}`;
  statusEl.classList.toggle('mock', Boolean(st.isMock));
  statusEl.classList.toggle('real', !st.isMock);
  statusEl.title = st.binaryPath || '';
}

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

function renderListItem(
  title: string,
  meta: string,
  actionLabel?: string,
  onAction?: () => void,
  extraActions?: { label: string; onClick: () => void }[],
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'list-item';
  const left = document.createElement('div');
  left.innerHTML = `<div>${title}</div><div class="meta">${meta}</div>`;
  row.appendChild(left);
  const actions = document.createElement('div');
  actions.className = 'list-actions';
  let has = false;
  if (actionLabel && onAction) {
    has = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capsule-btn';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => onAction());
    actions.appendChild(btn);
  }
  for (const extra of extraActions || []) {
    has = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capsule-btn';
    btn.textContent = extra.label;
    btn.addEventListener('click', () => extra.onClick());
    actions.appendChild(btn);
  }
  if (has) row.appendChild(actions);
  return row;
}

async function setDefaultModel(modelRef: string): Promise<void> {
  await window.xyai.setSettings?.({ modelId: modelRef });
  settingsModel.value = modelRef;
  alert(`已设为默认：${modelRef}`);
}

async function refreshModels(): Promise<void> {
  if (!window.xyai?.modelSnapshot) {
    hwPanel.textContent = '模型 API 不可用，请重装最新安装包。';
    return;
  }
  hwPanel.textContent = '正在检测硬件与本地模型…';
  depPanel.textContent = '';
  installedList.innerHTML = '';
  recList.innerHTML = '';
  embedList.innerHTML = '';
  try {
    const snap = (await window.xyai.modelSnapshot()) as any;
    const hw = snap.hardware;
    const vramGb = (hw.primaryVramMb / 1024).toFixed(1);
    const ramGb = (hw.ramTotalMb / 1024).toFixed(1);
    hwPanel.innerHTML = `
      <div class="hw-line">CPU：${hw.cpuName}（${hw.cpuCores} 线程）</div>
      <div class="hw-line">内存：${ramGb} GB</div>
      <div class="hw-line">主 GPU 显存：${vramGb} GB</div>
      <div class="hw-line">GPU：${(hw.gpus || []).map((g: any) => g.name).join(' / ')}</div>
    `;
    if (hw.usage) {
      renderUsageLine(hw.usage);
    }
    startHwPoll();

    const dep = snap.ollama;
    lastOllama = {
      installed: Boolean(dep.installed),
      running: Boolean(dep.running),
    };
    const canStart = Boolean(dep.canStart) || (dep.installed && !dep.running);
    depPanel.innerHTML = `
      <div class="hw-line">Ollama：${dep.installed ? '已安装' : '未安装'}${dep.version ? ` · v${dep.version}` : ''}</div>
      <div class="hw-line">服务：${dep.running ? '运行中' : '未运行'}</div>
      <div class="hw-line meta">${dep.path || dep.installCommand || ''}</div>
      ${
        canStart
          ? '<div class="hw-line">Ollama 已安装但未运行，可点「启动 Ollama」后刷新模型列表。</div>'
          : ''
      }
    `;
    btnInstall.disabled = Boolean(dep.installed);
    btnInstall.textContent = dep.installed ? 'Ollama 已安装' : '一键安装 Ollama';
    if (btnStartOllama) {
      btnStartOllama.hidden = !canStart;
      btnStartOllama.disabled = false;
      btnStartOllama.textContent = '启动 Ollama';
    }

    const installed = snap.installed || [];
    const registryIds = new Set(
      ((snap.registry || []) as { id?: string }[]).map((r) => r.id || ''),
    );
    if (!installed.length) {
      const emptyHint = canStart
        ? 'Ollama 已安装但未运行。请点「启动 Ollama」，启动后再刷新；不必只依赖全盘搜索。'
        : dep.installed
          ? '未检测到本地模型。可点「全盘搜索已下载模型」或从右侧推荐一键下载。'
          : '未检测到 Ollama。请先安装 Ollama，或点「全盘搜索已下载模型」作为兜底。';
      installedList.appendChild(el(`<div class="meta">${emptyHint}</div>`));
    } else {
      for (const m of installed) {
        const size =
          m.sizeBytes != null
            ? `${(m.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
            : '';
        const modelRef =
          typeof m.id === 'string' && m.id.includes(':')
            ? m.id
            : `ollama:${m.displayName || m.name || m.id}`;
        const registered = registryIds.has(m.id) || registryIds.has(modelRef);
        installedList.appendChild(
          renderListItem(
            m.displayName || m.name || modelRef,
            `${m.role || 'model'} · ${registered ? '已注册' : '未注册'}${size ? ` · ${size}` : ''}`,
            '设为默认',
            () => void setDefaultModel(modelRef),
            registered
              ? undefined
              : [
                  {
                    label: '一键注册',
                    onClick: () => {
                      // Snapshot upsert already merges installed → registry; re-run refresh.
                      void refreshModels().then(() =>
                        alert(`已尝试注册：${m.displayName || modelRef}`),
                      );
                    },
                  },
                ],
          ),
        );
      }
    }

    const chatRec = [
      ...(snap.recommendations?.chat || []),
      ...(snap.recommendations?.code || []),
    ];
    for (const r of chatRec) {
      recList.appendChild(
        renderListItem(r.displayName, r.reason, '安装', () =>
          void pullModel(r.ollamaName),
        ),
      );
    }
    for (const r of snap.recommendations?.embedding || []) {
      embedList.appendChild(
        renderListItem(r.displayName, r.reason, '安装', () =>
          void pullModel(r.ollamaName),
        ),
      );
    }
  } catch (err) {
    hwPanel.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function pullModel(name: string): Promise<void> {
  if (pulling) return;
  pulling = true;
  pullLog.hidden = false;
  pullLog.textContent = `开始拉取 ${name}…\n`;
  const stopProg = window.xyai.onPullProgress?.((data) => {
    if (data.name === name) {
      pullLog.textContent += data.line + '\n';
      pullLog.scrollTop = pullLog.scrollHeight;
    }
  });
  try {
    const res = await window.xyai.pullModel(name);
    pullLog.textContent += (res.ok ? '✓ ' : '✗ ') + res.message + '\n';
    await refreshModels();
  } catch (err) {
    pullLog.textContent += String(err) + '\n';
  } finally {
    stopProg?.();
    pulling = false;
  }
}

function renderCloudForm(cloud: any): void {
  cloudProvidersEl.innerHTML = '';
  for (const meta of CLOUD_META) {
    const cfg = cloud?.[meta.id] || {
      enabled: false,
      apiKey: '',
      baseUrl: '',
    };
    const box = document.createElement('div');
    box.className = 'provider';
    box.dataset.provider = meta.id;
    box.innerHTML = `
      <h3>
        <label class="check"><input type="checkbox" data-field="enabled" ${cfg.enabled ? 'checked' : ''}/> ${meta.label}</label>
      </h3>
      <div class="fields">
        <label>API Key
          <input type="password" data-field="apiKey" value="${String(cfg.apiKey || '').replace(/"/g, '&quot;')}" placeholder="sk-…" />
        </label>
        <label>Base URL
          <input type="text" data-field="baseUrl" value="${String(cfg.baseUrl || '').replace(/"/g, '&quot;')}" />
        </label>
      </div>
    `;
    cloudProvidersEl.appendChild(box);
  }
}

function readCloudForm(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  cloudProvidersEl.querySelectorAll('.provider').forEach((node) => {
    const elp = node as HTMLElement;
    const id = elp.dataset.provider!;
    const enabled = (
      elp.querySelector('[data-field="enabled"]') as HTMLInputElement
    ).checked;
    const apiKey = (
      elp.querySelector('[data-field="apiKey"]') as HTMLInputElement
    ).value;
    const baseUrl = (
      elp.querySelector('[data-field="baseUrl"]') as HTMLInputElement
    ).value;
    out[id] = { enabled, apiKey, baseUrl };
  });
  return out;
}

async function loadSettingsForms(chatFill?: typeof fillModelSelect): Promise<void> {
  if (!window.xyai.getSettings) return;
  const { settings, status } = await window.xyai.getSettings();
  renderStatusChip(status);
  (chatFill || fillModelSelect)(settingsModel, status);
  settingsCodexBin.value = settings.codexBin || '';
  settingsForceMock.checked = Boolean(settings.forceMock);
  renderCloudForm(settings.cloudProviders);
  renderCustomProviders(settings.customProviders || []);
}

function wireChrome(onModelsTab: () => void, onKnowledgeTab: () => void = () => {}, onPersonalizeTab: () => void = () => {}): void {
  const biz = mountBizZone(document.getElementById('zone-biz')!);
  const eco = mountEcoZone(document.getElementById('zone-eco')!);
  const browser = mountBrowserZone(document.getElementById('zone-browser')!);

  document.querySelectorAll('.zone').forEach((btn) => {
    btn.addEventListener('click', () => {
      const zone = (btn as HTMLElement).dataset.zone || 'dev';
      document
        .querySelectorAll('.zone')
        .forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.zone-body').forEach((body) => {
        body.classList.toggle(
          'active',
          (body as HTMLElement).id === `zone-${zone}`,
        );
      });
      if (zone === 'biz') biz.activate();
      if (zone === 'eco') eco.activate();
      if (zone === 'browser') browser.activate();
    });
  });

  document.querySelectorAll('.subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab || 'chat';
      document
        .querySelectorAll('.subtab')
        .forEach((b) => b.classList.toggle('active', b === btn));
      document
        .getElementById('view-chat')!
        .classList.toggle('active', tab === 'chat');
      document
        .getElementById('view-models')!
        .classList.toggle('active', tab === 'models');
      const kbView = document.getElementById('view-knowledge');
      if (kbView) kbView.classList.toggle('active', tab === 'knowledge');
      const pzView = document.getElementById('view-personalize');
      if (pzView) pzView.classList.toggle('active', tab === 'personalize');
      if (tab === 'models') {
        onModelsTab();
      } else {
        modelsTabVisible = false;
        stopHwPoll();
      }
      if (tab === 'knowledge') onKnowledgeTab();
      if (tab === 'personalize') onPersonalizeTab();
    });
  });

  document.getElementById('btn-about')?.addEventListener('click', () => {
    showAboutDialog(LOGO_SRC);
  });
}




let cachedCustomProviders: CustomProvider[] = [];

function renderCustomProviders(list: CustomProvider[]): void {
  cachedCustomProviders = list || [];
  let section = document.getElementById('custom-providers-section');
  if (!section) {
    const cloudCard = document.getElementById('cloud-card') || cloudProvidersEl.parentElement;
    if (!cloudCard) return;
    section = document.createElement('div');
    section.id = 'custom-providers-section';
    section.className = 'custom-providers-section';
    cloudCard.appendChild(section);
  }
  section.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'custom-providers-head';
  const h = document.createElement('h3');
  h.textContent = '自定义供应商';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'primary capsule-btn';
  addBtn.textContent = '+ 添加自定义供应商';
  addBtn.addEventListener('click', () => {
    void openAddCustomProviderFromModels();
  });
  head.append(h, addBtn);
  section.appendChild(head);

  if (!cachedCustomProviders.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '暂无自定义供应商。可从对话模型选择器的「+ 添加模型」或此处添加（如 DeepSeek 兼容端点）。';
    section.appendChild(empty);
    return;
  }

  for (const p of cachedCustomProviders) {
    const box = document.createElement('div');
    box.className = 'provider custom-provider-card';
    const models = (p.models || []).map((m) => m.label || m.id).join('、') || '（无模型）';
    box.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta">${escapeHtml(p.baseUrl || '')}</div>
      <div class="meta">协议：${escapeHtml(p.protocol)} · 运行时：${escapeHtml(p.runtime)} · 模型：${escapeHtml(models)}</div>
    `;
    const actions = document.createElement('div');
    actions.className = 'list-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'capsule-btn';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => {
      void openAddCustomProviderFromModels(p);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'capsule-btn';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      void deleteCustomProvider(p.id);
    });
    actions.append(edit, del);
    box.appendChild(actions);
    section.appendChild(box);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openAddCustomProviderFromModels(
  initial?: CustomProvider,
): Promise<void> {
  const outcome = await openCustomProviderModal({
    initial: initial || null,
    onTest: async (draft) =>
      (await window.xyai.testCustomProvider?.(draft)) || {
        ok: false,
        message: '测试接口不可用',
      },
    onFetchModels: async (draft) =>
      (await window.xyai.fetchCustomProviderModels?.(draft)) || {
        ok: false,
        message: '获取模型接口不可用',
        models: [],
      },
  });
  if (outcome.action !== 'save') return;
  const cur = await window.xyai.getSettings?.();
  const existing = cur?.settings?.customProviders || [];
  const next = [
    ...existing.filter((x) => x.id !== outcome.provider.id),
    outcome.provider,
  ];
  await window.xyai.setSettings?.({ customProviders: next });
  renderCustomProviders(next);
  alert('自定义供应商已保存');
}

async function deleteCustomProvider(id: string): Promise<void> {
  if (!confirm('确定删除该自定义供应商？')) return;
  const cur = await window.xyai.getSettings?.();
  const next = (cur?.settings?.customProviders || []).filter((x) => x.id !== id);
  await window.xyai.setSettings?.({ customProviders: next });
  renderCustomProviders(next);
}


async function boot(): Promise<void> {
  const chat = mountChat();
  const kbRoot = document.getElementById('knowledge-root');
  const kbPanel = kbRoot ? mountKnowledgePanel(kbRoot) : null;
  const pzRoot = document.getElementById('personalize-root');
  const pzPanel = pzRoot ? mountPersonalizePanel(pzRoot) : null;

  wireChrome(
    () => {
      void refreshModels();
      void loadSettingsForms(chat.fillModelSelect);
    },
    () => {
      void kbPanel?.refresh();
    },
    () => {
      void pzPanel?.refresh();
    },
  );

  if (!window.xyai) {
    if (statusEl) statusEl.textContent = '预加载失败，请重装安装包';
    if (statusEl) statusEl.classList.add('mock');
    chat.unlockInput();
    return;
  }

  window.xyai.onEvent(chat.handleEvent);

  btnRefresh.addEventListener('click', () => void refreshModels());
  document.getElementById('btn-scan-models')?.addEventListener('click', () => {
    void (async () => {
      const scanBtn = document.getElementById(
        'btn-scan-models',
      ) as HTMLButtonElement | null;
      const prevLabel = scanBtn?.textContent || '全盘搜索已下载模型';
      if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.textContent = '正在启动 Ollama…';
      }
      try {
        // Do not only refreshModels() — API is down until ollama serve.
        if (window.xyai.startOllama) {
          await window.xyai.startOllama();
        }
        await refreshModels();
        const n = installedList.querySelectorAll('.list-item').length;
        alert(
          formatLocalModelScanResult({
            count: n,
            installed: lastOllama.installed,
            running: lastOllama.running,
          }),
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      } finally {
        if (scanBtn) {
          scanBtn.disabled = false;
          scanBtn.textContent = prevLabel;
        }
      }
    })();
  });
  btnStartOllama?.addEventListener('click', async () => {
    if (!window.xyai.startOllama) {
      alert('启动接口不可用，请重装最新安装包');
      return;
    }
    btnStartOllama.disabled = true;
    btnStartOllama.textContent = '正在启动 Ollama…';
    try {
      const res = await window.xyai.startOllama();
      alert(res.message);
      await refreshModels();
    } catch (err) {
      alert(String(err));
    } finally {
      btnStartOllama.disabled = false;
      btnStartOllama.textContent = '启动 Ollama';
    }
  });
  document.querySelectorAll('.models-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.modelsTab || 'local';
      document.querySelectorAll('.models-tab').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const localPane = document.getElementById('models-pane-local');
      const cloudPane = document.getElementById('models-pane-cloud');
      if (localPane) {
        localPane.classList.toggle('active', tab === 'local');
        localPane.hidden = tab !== 'local';
      }
      if (cloudPane) {
        cloudPane.classList.toggle('active', tab === 'cloud');
        cloudPane.hidden = tab !== 'cloud';
      }
    });
  });
  btnInstall.addEventListener('click', async () => {
    btnInstall.disabled = true;
    btnInstall.textContent = '安装中…';
    try {
      const res = await window.xyai.installModelDep();
      alert(res.message);
      await refreshModels();
    } catch (err) {
      alert(String(err));
    } finally {
      btnInstall.disabled = false;
    }
  });

  document
    .getElementById('btn-save-codex')
    ?.addEventListener('click', async () => {
      await window.xyai.setSettings?.({
        modelId: settingsModel.value,
        forceMock: settingsForceMock.checked,
        codexBin: settingsCodexBin.value,
      });
      await chat.refreshFromStatus();
      const st = await window.xyai.getStatus();
      renderStatusChip(st);
      chat.fillModelSelect(settingsModel, st);
      alert('Codex 设置已保存');
    });

  document
    .getElementById('btn-add-custom-provider')
    ?.addEventListener('click', () => {
      void openAddCustomProviderFromModels();
    });

  document
    .getElementById('btn-save-cloud')
    ?.addEventListener('click', async () => {
      await window.xyai.setSettings?.({
        cloudProviders: readCloudForm() as any,
      });
      alert('云端 Provider 设置已保存（本机）');
    });

  try {
    const st = await window.xyai.getStatus();
    renderStatusChip(st);
    await chat.refreshFromStatus(st);
    await loadSettingsForms(chat.fillModelSelect);
  } catch {
    if (statusEl) statusEl.textContent = '状态不可用';
    if (statusEl) statusEl.classList.add('mock');
  }

  chat.unlockInput();
  chat.focusComposer();
}

void boot();
