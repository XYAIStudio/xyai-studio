/**
 * Chat assembler — Composer / ModelPicker / Transcript / AgentRail / Collab SessionRail.
 */

import { createAgentRail } from './agent-rail.js';
import {
  getSelectedAgentId,
  setSelectedAgentId,
} from './agent-bind.js';
import { DEFAULT_AGENT, getAgentById } from './agents.js';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TASK_ID,
  emptyCollabState,
  type CollabRailState,
  type CollabSessionMeta,
} from './collab-types.js';
import {
  promptAssignWork,
  promptProject,
  promptTask,
} from './collab-modals.js';
import { createAccessModeControl } from './access-mode.js';
import { createComposer } from './composer.js';
import { createHistoryNavRail } from './history-nav-rail.js';
import { createModelPicker } from './model-picker.js';
import {
  createRightSidebar,
  type OpenedFile,
} from './right-sidebar.js';
import { createSessionRail } from './session-rail.js';
import { createTranscript } from './transcript.js';
import type { AgentEvent, XyaiStatus, ChatCitation } from './types.js';
import type { KbMount } from '../xyai-api.js';

export type ChatMount = {
  refreshFromStatus: (st?: XyaiStatus) => Promise<void>;
  handleEvent: (ev: AgentEvent) => void;
  unlockInput: () => void;
  focusComposer: () => void;
  fillModelSelect: (sel: HTMLSelectElement, st: XyaiStatus) => void;
};

type RailTab = 'agents' | 'sessions';

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[chat] missing #${id}`);
  return el as T;
}


/** Detect cloud provider prefix on modelRef that requires a non-empty apiKey. */
function missingCloudApiKey(
  modelRef: string,
  cloud: unknown,
  customProviders: unknown = [],
): string | null {
  const raw = modelRef.trim().toLowerCase();
  if (!raw || raw.startsWith('ollama:')) return null;
  if (raw.startsWith('custom:')) {
    const list = Array.isArray(customProviders) ? customProviders : [];
    const rest = modelRef.trim().slice('custom:'.length);
    const slash = rest.indexOf('/');
    const providerId = slash > 0 ? rest.slice(0, slash) : '';
    const hit = list.find(
      (p) =>
        p &&
        typeof p === 'object' &&
        (p as { id?: string }).id === providerId,
    ) as
      | { name?: string; auth?: string; apiKey?: string }
      | undefined;
    if (!hit) return '自定义供应商';
    if (hit.auth === 'none') return null;
    if (hit.auth === 'oauth') return `${hit.name || providerId}（OAuth 尚未就绪）`;
    if (!(hit.apiKey || '').trim()) return hit.name || providerId;
    return null;
  }
  const map = (cloud || {}) as Record<string, { apiKey?: string } | undefined>;
  // Do not false-positive plain codex:/legacy bare ids (Codex harness / mock)
  const providers = ['openai', 'deepseek', 'openrouter', 'anthropic'] as const;
  for (const id of providers) {
    const hit =
      raw === id ||
      raw.startsWith(id + ':') ||
      raw.startsWith('codex:' + id + ':');
    if (!hit) continue;
    const key = (map[id]?.apiKey || '').trim();
    if (!key) return id;
    return null;
  }
  return null;
}


export function fillModelSelect(
  sel: HTMLSelectElement,
  st: XyaiStatus,
): void {
  const cur = st.modelId || sel.value;
  sel.innerHTML = '';
  if ((st.localModels || []).length) {
    const group = document.createElement('optgroup');
    group.label = '本地已注册';
    for (const item of st.localModels || []) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
  const group2 = document.createElement('optgroup');
  group2.label = 'Codex 引擎';
  for (const item of st.models || []) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    group2.appendChild(opt);
  }
  sel.appendChild(group2);
  if (cur) {
    sel.value = cur;
    if (sel.value !== cur) {
      const opt = document.createElement('option');
      opt.value = cur;
      opt.textContent = cur;
      sel.appendChild(opt);
      sel.value = cur;
    }
  }
}

export function mountChat(): ChatMount {
  const transcriptEl = requireEl<HTMLElement>('transcript');
  const transcriptWrap = requireEl<HTMLElement>('transcript-wrap');
  const chatMain = requireEl<HTMLElement>('chat-main');
  const agentListEl = requireEl<HTMLElement>('agent-list');
  const sessionListEl = requireEl<HTMLElement>('session-list');
  const newBtn = document.getElementById('btn-new-session');
  const newProjectBtn = document.getElementById('btn-new-project');
  const tabAgents = document.getElementById('rail-tab-agents');
  const tabSessions = document.getElementById('rail-tab-sessions');
  const composerRoot = requireEl<HTMLElement>('composer');
  const input = requireEl<HTMLTextAreaElement>('input');
  const primaryBtn = requireEl<HTMLButtonElement>('primary-action');
  const chipBtn = requireEl<HTMLButtonElement>('model-chip');
  const chipLabel = requireEl<HTMLElement>('model-chip-label');
  const panel = requireEl<HTMLElement>('model-panel');
  const panelBody = requireEl<HTMLElement>('model-panel-body');
  const searchInput = document.getElementById(
    'model-search',
  ) as HTMLInputElement | null;
  const attachBtn = requireEl<HTMLButtonElement>('btn-attach');
  const accessChipBtn = requireEl<HTMLButtonElement>('access-chip');
  const attachChipsEl = requireEl<HTMLElement>('attach-chips');

  const transcript = createTranscript(transcriptEl);
  transcript.onAction((action) => {
    if (action.id !== 'start-ollama') return;
    void (async () => {
      if (!window.xyai.startOllama) {
        transcript.appendError('启动接口不可用，请重装最新安装包');
        return;
      }
      transcript.appendSystem('正在启动 Ollama…');
      try {
        const res = await window.xyai.startOllama();
        if (res.status) {
          lastStatus = res.status;
          picker.applyStatus(res.status);
        }
        if (res.ok && res.running) {
          transcript.appendSystem('Ollama 已启动，请再次发送消息');
          return;
        }
        transcript.appendError(
          res.message || 'Ollama 仍未就绪',
          { id: 'start-ollama', label: '启动 Ollama' },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        transcript.appendError(msg, {
          id: 'start-ollama',
          label: '启动 Ollama',
        });
      }
    })();
  });
  const historyRail = createHistoryNavRail({
    mountParent: transcriptWrap,
    transcriptEl,
  });
  const rightSidebar = createRightSidebar({ chatMain });
  const accessMode = createAccessModeControl({ chipBtn: accessChipBtn });
  const agentRail = createAgentRail({ listEl: agentListEl });
  const rail = createSessionRail({
    listEl: sessionListEl,
    newBtn,
    newProjectBtn,
  });
  const picker = createModelPicker({
    chipBtn,
    chipLabel,
    panel,
    panelBody,
    searchInput,
  });
  const composer = createComposer({
    root: composerRoot,
    input,
    primaryBtn,
  });

  let turnGen = 0;
  let lastStatus: XyaiStatus | null = null;
  let collab: CollabRailState = emptyCollabState();
  let selectedProjectId = DEFAULT_PROJECT_ID;
  let selectedTaskId = DEFAULT_TASK_ID;
  /** sessionId -> opened attachment paths */
  const sessionFiles = new Map<string, OpenedFile[]>();
  let pendingAttach: OpenedFile[] = [];
  /** Knowledge bases selected via @ for the next turn. */
  let pendingKbIds: string[] = [];
  let lastTurnCitations: ChatCitation[] = [];
  const kbMentionChipsEl = document.getElementById('kb-mention-chips');
  const kbAtMenu = document.getElementById('kb-at-menu');
  const kbMentionBtn = document.getElementById('btn-kb-mention');

  function basename(p: string): string {
    const parts = p.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || p;
  }

  function filesFor(sessionId: string): OpenedFile[] {
    if (!sessionFiles.has(sessionId)) sessionFiles.set(sessionId, []);
    return sessionFiles.get(sessionId)!;
  }

  function renderAttachChips(): void {
    attachChipsEl.innerHTML = '';
    if (!pendingAttach.length) {
      attachChipsEl.hidden = true;
      return;
    }
    attachChipsEl.hidden = false;
    for (const f of pendingAttach) {
      const chip = document.createElement('span');
      chip.className = 'attach-chip';
      chip.title = f.path;
      const label = document.createElement('span');
      label.textContent = f.name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'attach-chip-rm';
      rm.textContent = '×';
      rm.setAttribute('aria-label', `移除 ${f.name}`);
      rm.addEventListener('click', () => {
        pendingAttach = pendingAttach.filter((x) => x.path !== f.path);
        renderAttachChips();
      });
      chip.appendChild(label);
      chip.appendChild(rm);
      attachChipsEl.appendChild(chip);
    }
  }

  function syncSidePanels(): void {
    const sid = transcript.getActiveId();
    const msgs = transcript.getMessages();
    historyRail.sync(msgs);
    rightSidebar.setReviewStub(msgs);
    rightSidebar.setCollab(collab);
    if (sid) rightSidebar.setOpenedFiles(filesFor(sid).slice());
  }

  function setRailTab(tab: RailTab): void {
    const agentsActive = tab === 'agents';
    agentListEl.hidden = !agentsActive;
    sessionListEl.hidden = agentsActive;
    tabAgents?.classList.toggle('active', agentsActive);
    tabSessions?.classList.toggle('active', !agentsActive);
    tabAgents?.setAttribute('aria-selected', agentsActive ? 'true' : 'false');
    tabSessions?.setAttribute(
      'aria-selected',
      agentsActive ? 'false' : 'true',
    );
  }

  async function loadCollab(): Promise<void> {
    if (!window.xyai.collabGet) {
      collab = emptyCollabState();
      return;
    }
    try {
      collab = (await window.xyai.collabGet()) as CollabRailState;
    } catch {
      collab = emptyCollabState();
    }
  }

  function renderRails(status: XyaiStatus): void {
    const sessions = status.sessions || [];
    const activeId = status.activeSessionId || sessions[0]?.id || '';
    agentRail.render(getSelectedAgentId());
    rail.render({
      hostSessions: sessions,
      activeId,
      collab,
      selectedTaskId,
    });
    transcript.setActiveId(activeId);
    transcript.render();
    syncSidePanels();
  }

  async function refreshFromStatus(st?: XyaiStatus): Promise<void> {
    const status = st || (await window.xyai.getStatus());
    lastStatus = status;
    picker.applyStatus(status);
    await loadCollab();
    // Adopt orphan host sessions into default project/task
    await adoptOrphans(status);
    renderRails(status);
    composer.setBusy(Boolean(status.isSending));
    await accessMode.syncFromSettings();
  }

  async function adoptOrphans(status: XyaiStatus): Promise<void> {
    if (!window.xyai.collabSessionUpsert) return;
    const known = new Set(collab.sessions.map((s) => s.sessionId));
    let changed = false;
    for (const s of status.sessions || []) {
      if (known.has(s.id)) continue;
      collab = (await window.xyai.collabSessionUpsert({
        sessionId: s.id,
        kind: 'dm',
        projectId: DEFAULT_PROJECT_ID,
        taskId: DEFAULT_TASK_ID,
        agentIds: [getSelectedAgentId() || DEFAULT_AGENT.id],
      })) as CollabRailState;
      changed = true;
    }
    if (changed) {
      /* collab already refreshed */
    }
  }

  async function switchSession(id: string): Promise<void> {
    if (!window.xyai.switchSession) return;
    const meta = collab.sessions.find((s) => s.sessionId === id);
    if (meta?.agentIds[0]) setSelectedAgentId(meta.agentIds[0]);
    if (meta) {
      selectedProjectId = meta.projectId;
      selectedTaskId = meta.taskId;
    }
    const res = await window.xyai.switchSession(id);
    await refreshFromStatus(res.status);
  }

  async function deleteSession(id: string): Promise<void> {
    if (!window.xyai.deleteSession) return;
    const res = await window.xyai.deleteSession(id);
    if (!res.ok) return;
    await window.xyai.collabSessionRemove?.({ sessionId: id });
    transcript.clearSession(id);
    await refreshFromStatus(res.status);
  }

  async function createBoundSession(input: {
    title: string;
    kind: 'dm' | 'group';
    projectId: string;
    taskId: string;
    agentIds: string[];
  }): Promise<string | null> {
    if (!window.xyai.createSession) return null;
    const res = await window.xyai.createSession(input.title);
    const sid = res.session?.id || res.status?.activeSessionId || '';
    if (!sid) return null;
    const meta: CollabSessionMeta = {
      sessionId: sid,
      kind: input.kind,
      projectId: input.projectId,
      taskId: input.taskId,
      agentIds: input.agentIds,
      title: input.kind === 'group' ? input.title : undefined,
    };
    collab = (await window.xyai.collabSessionUpsert?.(meta)) as CollabRailState;
    lastStatus = res.status;
    return sid;
  }

  async function newSession(): Promise<void> {
    const agentId = getSelectedAgentId() || DEFAULT_AGENT.id;
    const agent = getAgentById(agentId);
    const title = agent ? `与${agent.name}` : '新对话';
    const sid = await createBoundSession({
      title,
      kind: 'dm',
      projectId: selectedProjectId || DEFAULT_PROJECT_ID,
      taskId: selectedTaskId || DEFAULT_TASK_ID,
      agentIds: [agentId],
    });
    setRailTab('sessions');
    if (lastStatus) await refreshFromStatus(lastStatus);
    else await refreshFromStatus();
    if (sid) await switchSession(sid);
    composer.focus();
  }

  /**
   * Selecting an agent focuses chat: prefer an existing DM with that agent
   * under the current/default task; otherwise create one.
   */
  async function selectAgent(agentId: string): Promise<void> {
    setSelectedAgentId(agentId || DEFAULT_AGENT.id);
    agentRail.render(getSelectedAgentId());

    const status = lastStatus || (await window.xyai.getStatus());
    lastStatus = status;
    await loadCollab();

    const match = collab.sessions.find(
      (s) =>
        s.kind === 'dm' &&
        s.agentIds.includes(agentId) &&
        (status.sessions || []).some((h) => h.id === s.sessionId),
    );
    if (match) {
      selectedProjectId = match.projectId;
      selectedTaskId = match.taskId;
      await switchSession(match.sessionId);
    } else {
      selectedProjectId = DEFAULT_PROJECT_ID;
      selectedTaskId = DEFAULT_TASK_ID;
      await newSession();
    }
    setRailTab('sessions');
    composer.focus();
  }

  async function browseDir(): Promise<string | null> {
    const res = await window.xyai.collabPickDirectory?.();
    if (res?.ok && res.path) return res.path;
    return null;
  }

  async function onNewProject(): Promise<void> {
    const form = await promptProject({
      title: '新建项目',
      onBrowse: browseDir,
    });
    if (!form || !window.xyai.collabProjectCreate) return;
    collab = (await window.xyai.collabProjectCreate(form)) as CollabRailState;
    const created = collab.projects[collab.projects.length - 1];
    if (created) selectedProjectId = created.id;
    setRailTab('sessions');
    if (lastStatus) renderRails(lastStatus);
    else await refreshFromStatus();
  }

  async function onEditProject(projectId: string): Promise<void> {
    const p = collab.projects.find((x) => x.id === projectId);
    if (!p) return;
    const form = await promptProject({
      title: '编辑项目',
      name: p.name,
      cwd: p.cwd,
      onBrowse: browseDir,
    });
    if (!form || !window.xyai.collabProjectUpdate) return;
    collab = (await window.xyai.collabProjectUpdate({
      id: projectId,
      name: form.name,
      cwd: form.cwd,
    })) as CollabRailState;
    if (lastStatus) renderRails(lastStatus);
  }

  async function onNewTask(projectId: string): Promise<void> {
    const form = await promptTask({ title: '新建任务' });
    if (!form || !window.xyai.collabTaskCreate) return;
    collab = (await window.xyai.collabTaskCreate({
      projectId,
      name: form.name,
    })) as CollabRailState;
    const created = [...collab.tasks]
      .reverse()
      .find((t) => t.projectId === projectId && t.name === form.name);
    if (created) {
      selectedProjectId = projectId;
      selectedTaskId = created.id;
    }
    if (lastStatus) renderRails(lastStatus);
  }

  async function onEditTask(taskId: string): Promise<void> {
    const task = collab.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const form = await promptTask({ title: '编辑任务', name: task.name });
    if (!form || !window.xyai.collabTaskUpdate) return;
    collab = (await window.xyai.collabTaskUpdate({
      id: taskId,
      name: form.name,
    })) as CollabRailState;
    if (lastStatus) renderRails(lastStatus);
  }

  async function onArchiveTask(
    taskId: string,
    archived: boolean,
  ): Promise<void> {
    if (!window.xyai.collabTaskUpdate) return;
    collab = (await window.xyai.collabTaskUpdate({
      id: taskId,
      archived,
    })) as CollabRailState;
    if (lastStatus) renderRails(lastStatus);
  }

  async function onDeleteTask(taskId: string): Promise<void> {
    if (!window.xyai.collabTaskDelete) return;
    collab = (await window.xyai.collabTaskDelete({
      id: taskId,
    })) as CollabRailState;
    if (selectedTaskId === taskId) selectedTaskId = DEFAULT_TASK_ID;
    if (lastStatus) renderRails(lastStatus);
  }

  async function onAssignWork(taskId: string): Promise<void> {
    const task = collab.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const form = await promptAssignWork({
      taskName: task.name,
      defaultAgentId: getSelectedAgentId(),
    });
    if (!form) return;

    selectedProjectId = task.projectId;
    selectedTaskId = task.id;
    setRailTab('sessions');

    if (form.kind === 'dm') {
      let lastSid: string | null = null;
      for (const agentId of form.agentIds) {
        const agent = getAgentById(agentId);
        const title = agent ? `与${agent.name}` : '单聊';
        lastSid = await createBoundSession({
          title,
          kind: 'dm',
          projectId: task.projectId,
          taskId: task.id,
          agentIds: [agentId],
        });
      }
      if (lastStatus) await refreshFromStatus(lastStatus);
      if (lastSid) await switchSession(lastSid);
    } else {
      const sid = await createBoundSession({
        title: form.groupName,
        kind: 'group',
        projectId: task.projectId,
        taskId: task.id,
        agentIds: form.agentIds,
      });
      if (lastStatus) await refreshFromStatus(lastStatus);
      if (sid) await switchSession(sid);
    }
    composer.focus();
  }

  function renderKbMentionChips(): void {
    if (!kbMentionChipsEl) return;
    kbMentionChipsEl.innerHTML = '';
    if (!pendingKbIds.length) {
      kbMentionChipsEl.hidden = true;
      return;
    }
    kbMentionChipsEl.hidden = false;
    void (async () => {
      const mounts = (await window.xyai.kbGetState?.())?.mounts || [];
      const byId = new Map(mounts.map((m) => [m.id, m] as const));
      kbMentionChipsEl.innerHTML = '';
      for (const id of pendingKbIds) {
        const m = byId.get(id);
        const chip = document.createElement('span');
        chip.className = 'kb-mention-chip';
        const label = document.createElement('span');
        label.textContent = '@' + (m?.name || id.slice(0, 8));
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '×';
        rm.setAttribute('aria-label', '移除知识库');
        rm.addEventListener('click', () => {
          pendingKbIds = pendingKbIds.filter((x) => x !== id);
          renderKbMentionChips();
        });
        chip.appendChild(label);
        chip.appendChild(rm);
        kbMentionChipsEl.appendChild(chip);
      }
    })();
  }

  async function openKbAtMenu(): Promise<void> {
    if (!kbAtMenu) return;
    const mounts: KbMount[] =
      (await window.xyai.kbGetState?.())?.mounts || [];
    kbAtMenu.innerHTML = '';
    if (!mounts.length) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.style.padding = '8px';
      empty.textContent = '请先在「知识库」挂接';
      kbAtMenu.appendChild(empty);
      kbAtMenu.hidden = false;
      return;
    }
    for (const m of mounts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.textContent =
        '@' + m.name + (m.kind === 'cloud' ? ' (云)' : '');
      btn.classList.toggle('active', pendingKbIds.includes(m.id));
      btn.addEventListener('click', () => {
        if (pendingKbIds.includes(m.id)) {
          pendingKbIds = pendingKbIds.filter((x) => x !== m.id);
        } else {
          pendingKbIds = [...pendingKbIds, m.id];
        }
        renderKbMentionChips();
        kbAtMenu.hidden = true;
      });
      kbAtMenu.appendChild(btn);
    }
    kbAtMenu.hidden = false;
  }

  function parseAtMentionsFromText(raw: string): {
    clean: string;
    names: string[];
  } {
    const names: string[] = [];
    const clean = raw
      .replace(/@([\w\u4e00-\u9fff.-]+)/g, (_m, name: string) => {
        names.push(name);
        return '';
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
    return { clean, names };
  }

  async function send(content: string): Promise<void> {
    const attachments = pendingAttach.slice();
    const trimmed = content.trim();
    if (
      (!trimmed && !attachments.length && !pendingKbIds.length) ||
      composer.isBusy()
    ) {
      return;
    }
    if (!window.xyai) {
      transcript.appendError('window.xyai 不可用，请重装安装包');
      return;
    }

    // Cloud provider API key gate (ollama/codex mock/local never blocked)
    try {
      const modelRef = picker.getSelectedId() || lastStatus?.modelId || '';
      const settingsRes = await window.xyai.getSettings?.();
      const cloud = settingsRes?.settings?.cloudProviders;
      if (cloud && modelRef) {
        const missing = missingCloudApiKey(
          modelRef,
          cloud,
          settingsRes?.settings?.customProviders,
        );
        if (missing) {
          transcript.appendError(
            `请先设置 API key（可到「模型」页填写）· 缺少 ${missing} 的密钥`,
          );
          return;
        }
      }
    } catch {
      /* ignore settings probe failures; main host also gates */
    }

    const atParsed = parseAtMentionsFromText(trimmed);
    const displayText = atParsed.clean || trimmed;
    const mounts = (await window.xyai.kbGetState?.())?.mounts || [];
    for (const name of atParsed.names) {
      const hit = mounts.find(
        (m) => m.name === name || m.name.includes(name),
      );
      if (hit && !pendingKbIds.includes(hit.id)) pendingKbIds.push(hit.id);
    }
    renderKbMentionChips();

    let outbound = displayText;
    // Attachments: always extract BEFORE KB search so empty index never blocks
    // summarize-with-PDF. Prefer meaningful body (CJK/letters), not XMP head.
    if (attachments.length) {
      const lines = attachments.map(
        (f) => `- [${f.name}](${f.path.replace(/\\/g, '/')})`,
      );
      const block = `**附件**\n${lines.join('\n')}`;
      outbound = outbound ? `${block}\n\n${outbound}` : block;

      const extractParts: string[] = [];
      let anyBody = false;
      let anyFail = false;
      for (const f of attachments) {
        try {
          const ex = await window.xyai.extractAttachment?.(f.path);
          const body = (ex?.text || '').trim();
          if (ex?.ok && body) {
            anyBody = true;
            // Cap ~30k; preferMeaningfulSlice already applied in main extract for PDF.
            const capped =
              body.length > 30000 ? `${body.slice(0, 30000)}\n…(截断)` : body;
            extractParts.push(`### 附件正文：${f.name}\n${capped}`);
          } else {
            anyFail = true;
            extractParts.push(
              `### 附件：${f.name}\n（提取失败${ex?.message ? '：' + ex.message : '：未能得到可用正文'}。请勿根据文件名或训练知识编造内容。）`,
            );
          }
        } catch (err) {
          anyFail = true;
          const msg = err instanceof Error ? err.message : String(err);
          extractParts.push(
            `### 附件：${f.name}\n（提取异常：${msg}。请勿编造附件内容。）`,
          );
        }
      }
      if (extractParts.length) {
        const rule =
          '必须依据下列【附件正文】总结，禁止用训练知识编造；若正文为空再如实说明提取失败。';
        const header = anyBody
          ? `【附件正文——请仅据此回答】\n${rule}`
          : `【附件正文提取失败】\n${rule}`;
        outbound = `${header}\n\n${extractParts.join('\n\n')}\n\n${outbound}`;
        if (anyFail && !anyBody) {
          rightSidebar.appendTerminal(
            '【提示：附件正文提取失败，已告知模型勿编造】',
          );
        }
      }
    }

    lastTurnCitations = [];
    const kbIdsForTurn = pendingKbIds.slice();
    if (kbIdsForTurn.length && window.xyai.kbSearch) {
      try {
        const res = await window.xyai.kbSearch({
          kbIds: kbIdsForTurn,
          query: displayText || trimmed || '概述',
          limit: 8,
        });
        const hits = Array.isArray(res.hits) ? res.hits : [];
        if (res.context) {
          outbound = `${res.context}\n${outbound}`;
        } else {
          // Never silently drop attached KBs
          const names = mounts
            .filter((m) => kbIdsForTurn.includes(m.id))
            .map((m) => m.name);
          const banner =
            names.length > 0
              ? `【已挂载知识库：${names.join('、')}】\n`
              : '【已挂载知识库】\n';
          outbound = `${banner}【所选知识库暂无可用检索结果】\n\n${outbound}`;
        }
        lastTurnCitations = (res.citations || []) as ChatCitation[];
        const emptyNames = res.emptyIndexNames || [];
        if (emptyNames.length) {
          const hasAttach = attachments.length > 0;
          const hasHits = hits.length > 0;
          // Never appendError+abort for empty index when attachments exist —
          // chat already extracted attachment body above for the local LLM.
          // Hard block only when @KB with empty index, no attachments, no hits.
          if (!hasAttach && !hasHits) {
            for (const name of emptyNames) {
              transcript.appendError(
                `【知识库「${name}」尚未有可用索引，请先在知识库页完成解析】`,
              );
            }
            return;
          }
          // Soft note: continue turn (attachments / hits already in outbound).
          const tip = `【提示：知识库「${emptyNames.join('、')}」尚未完成解析；已改用附件正文或已有检索结果继续】`;
          outbound = `${tip}\n${outbound}`;
          rightSidebar.appendTerminal(tip);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        transcript.appendError('知识库检索失败：' + msg);
      }
    }

    const sid = transcript.getActiveId();
    if (sid && attachments.length) {
      const bag = filesFor(sid);
      for (const f of attachments) {
        if (!bag.some((x) => x.path === f.path)) bag.push(f);
      }
      rightSidebar.setOpenedFiles(bag.slice());
    }

    pendingAttach = [];
    renderAttachChips();

    const gen = ++turnGen;
    {
      const visibleParts: string[] = [];
      if (kbIdsForTurn.length) {
        const names = mounts
          .filter((m) => kbIdsForTurn.includes(m.id))
          .map((m) => '@' + m.name);
        visibleParts.push(names.join(' '));
      }
      if (displayText) visibleParts.push(displayText);
      if (attachments.length) {
        visibleParts.push(
          '**附件**\n' +
            attachments
              .map((f) => `- [${f.name}](${f.path.replace(/\\/g, '/')})`)
              .join('\n'),
        );
      }
      transcript.appendUser(visibleParts.join('\n\n') || trimmed);
    }
    composer.clear();
    composer.setBusy(true);
    transcript.resetStreaming();
    rightSidebar.appendTerminal(
      `send: ${outbound.slice(0, 80).replace(/\n/g, ' ')}`,
    );

    try {
      await window.xyai.sendMessage(outbound);
      if (gen !== turnGen) return;
      if (lastTurnCitations.length) {
        transcript.setLastAssistantCitations(lastTurnCitations);
      }
      const st = await window.xyai.getStatus();
      lastStatus = st;
      picker.applyStatus(st);
      await loadCollab();
      renderRails(st);
    } catch (err) {
      if (gen !== turnGen) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort|cancel|已停止/i.test(msg) || msg === 'cancelled') {
        transcript.flushStreaming();
        return;
      }
      if (/fetch failed|ECONNREFUSED|Ollama 服务未运行/i.test(msg)) {
        transcript.appendError(
          'Ollama 服务未运行。请点击「启动 Ollama」后重试。',
          { id: 'start-ollama', label: '启动 Ollama' },
        );
        return;
      }
      transcript.appendError(msg);
    } finally {
      if (gen === turnGen) {
        transcript.flushStreaming();
        if (lastTurnCitations.length) {
          transcript.setLastAssistantCitations(lastTurnCitations);
        }
        composer.setBusy(false);
      }
    }
  }

  async function stop(): Promise<void> {
    turnGen += 1;
    composer.setBusy(false);
    transcript.flushStreaming();
    rightSidebar.appendTerminal('stop');
    try {
      await window.xyai.stopTurn?.();
    } catch {
      /* ignore */
    }
  }

  function handleEvent(ev: AgentEvent): void {
    transcript.handleEvent(ev);
    // transcript.render already triggers onAfterRender → syncSidePanels
  }

  tabAgents?.addEventListener('click', () => setRailTab('agents'));
  tabSessions?.addEventListener('click', () => setRailTab('sessions'));
  setRailTab('agents');

  agentRail.wire({
    onSelect: (id) => void selectAgent(id),
    onPushToBiz: (agent) => {
      void (async () => {
        const res = await window.xyai.interopPushToBiz?.({
          kind: 'agent',
          name: agent.name,
          description: agent.subtitle,
          payload: {
            agentId: agent.id,
            badge: agent.badge,
            subtitle: agent.subtitle,
          },
        });
        if (!res?.ok) {
          transcript.appendError(res?.message || '推送到业务空间失败');
          return;
        }
        rightSidebar.appendTerminal(
          `已推送 AI智能助手「${agent.name}」到业务空间（待安装为 AI员工候选）`,
        );
        alert(
          `已推送「${agent.name}」到业务空间\n可在业务空间「资产互通」中安装/选用`,
        );
      })();
    },
  });
  agentRail.render(getSelectedAgentId());

  rail.wire({
    onNewSession: () => void newSession(),
    onNewProject: () => void onNewProject(),
    onSwitch: (id) => void switchSession(id),
    onDeleteSession: (id) => void deleteSession(id),
    onToggleProject: (projectId, collapsed) => {
      void (async () => {
        collab = (await window.xyai.collabSetCollapsed?.({
          projectId,
          collapsed,
        })) as CollabRailState;
        if (lastStatus) renderRails(lastStatus);
      })();
    },
    onToggleTask: (taskId, collapsed) => {
      void (async () => {
        collab = (await window.xyai.collabSetCollapsed?.({
          taskId,
          collapsed,
        })) as CollabRailState;
        if (lastStatus) renderRails(lastStatus);
      })();
    },
    onEditProject: (id) => void onEditProject(id),
    onNewTask: (projectId) => void onNewTask(projectId),
    onEditTask: (id) => void onEditTask(id),
    onArchiveTask: (id, archived) => void onArchiveTask(id, archived),
    onDeleteTask: (id) => void onDeleteTask(id),
    onAssignWork: (taskId) => void onAssignWork(taskId),
    onSelectTask: (projectId, taskId) => {
      selectedProjectId = projectId;
      selectedTaskId = taskId;
      if (lastStatus) renderRails(lastStatus);
    },
  });

  picker.wire();

  transcript.onAfterRender((msgs) => {
    historyRail.sync(msgs);
    rightSidebar.setReviewStub(msgs);
  });

  rightSidebar.wire({
    onRemoveFile: (path) => {
      const sid = transcript.getActiveId();
      if (!sid) return;
      const bag = filesFor(sid).filter((f) => f.path !== path);
      sessionFiles.set(sid, bag);
      rightSidebar.setOpenedFiles(bag.slice());
      pendingAttach = pendingAttach.filter((f) => f.path !== path);
      renderAttachChips();
    },
    onOpenExternal: async (url) => {
      if (!window.xyai.openExternal) {
        rightSidebar.appendTerminal(`openExternal unavailable: ${url}`);
        return;
      }
      const res = await window.xyai.openExternal(url);
      rightSidebar.appendTerminal(
        res.ok ? `open: ${url}` : `open failed: ${res.message || url}`,
      );
    },
    onSelectTask: (taskId) => {
      const task = collab.tasks.find((t) => t.id === taskId);
      if (!task) return;
      selectedProjectId = task.projectId;
      selectedTaskId = task.id;
      setRailTab('sessions');
      if (lastStatus) renderRails(lastStatus);
    },
  });

  attachBtn.disabled = false;
  attachBtn.addEventListener('click', () => {
    void (async () => {
      if (!window.xyai.pickFiles) {
        transcript.appendError('pickFiles 不可用，请重建桌面端');
        return;
      }
      const res = await window.xyai.pickFiles();
      if (!res.ok || !res.paths.length) return;
      for (const path of res.paths) {
        if (pendingAttach.some((f) => f.path === path)) continue;
        pendingAttach.push({ path, name: basename(path) });
      }
      renderAttachChips();
      const sid = transcript.getActiveId();
      if (sid) {
        const bag = filesFor(sid);
        for (const f of pendingAttach) {
          if (!bag.some((x) => x.path === f.path)) bag.push(f);
        }
        rightSidebar.setOpenedFiles(bag.slice());
      }
    })();
  });

  void accessMode.syncFromSettings();

  composer.wire({
    onSend: (text) => void send(text),
    onStop: () => void stop(),
    canSendEmpty: () => pendingAttach.length > 0,
  });

  composer.unlockInput();

  kbMentionBtn?.addEventListener('click', () => {
    void openKbAtMenu();
  });
  input.addEventListener('input', () => {
    const v = input.value;
    const at = v.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(v[at - 1] || ''))) {
      const frag = v.slice(at + 1);
      if (!frag.includes(' ') && !frag.includes('\n')) {
        void openKbAtMenu();
        return;
      }
    }
    if (kbAtMenu) kbAtMenu.hidden = true;
  });
  document.addEventListener('click', (ev) => {
    const t = ev.target as Node | null;
    if (!t) return;
    if (kbAtMenu && !kbAtMenu.contains(t) && t !== kbMentionBtn) {
      kbAtMenu.hidden = true;
    }
  });

  return {
    refreshFromStatus,
    handleEvent,
    unlockInput: () => composer.unlockInput(),
    focusComposer: () => composer.focus(),
    fillModelSelect,
  };
}

export type {
  XyaiStatus,
  AgentEvent,
  SessionSummary,
  ModelOption,
} from './types.js';
