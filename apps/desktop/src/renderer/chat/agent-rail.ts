/**
 * AgentRail — flat 智能体列表 (dev space). Blue sky theme.
 */

import { DEV_AGENTS, type DevAgent } from './agents.js';
import { LOGO_SRC } from './mascot.js';

export type AgentRailApi = {
  render: (selectedId: string) => void;
  wire: (handlers: {
    onSelect: (agentId: string) => void;
    onPushToBiz?: (agent: DevAgent) => void;
  }) => void;
  getAgents: () => readonly DevAgent[];
};

export function createAgentRail(opts: {
  listEl: HTMLElement;
}): AgentRailApi {
  const { listEl } = opts;
  let wired = false;
  let onPush: ((agent: DevAgent) => void) | undefined;

  function render(selectedId: string): void {
    listEl.innerHTML = '';
    for (const agent of DEV_AGENTS) {
      const row = document.createElement('div');
      row.className =
        'agent-item' + (agent.id === selectedId ? ' active' : '');
      row.setAttribute('role', 'listitem');
      row.dataset.agentId = agent.id;

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'agent-select';
      selectBtn.dataset.agentId = agent.id;

      const avatar = document.createElement('span');
      avatar.className = 'agent-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      const avatarImg = document.createElement('img');
      avatarImg.src = LOGO_SRC;
      avatarImg.alt = '';
      avatarImg.draggable = false;
      avatar.appendChild(avatarImg);

      const body = document.createElement('span');
      body.className = 'agent-body';

      const top = document.createElement('span');
      top.className = 'agent-top';

      const name = document.createElement('span');
      name.className = 'agent-name';
      name.textContent = agent.name;

      const badge = document.createElement('span');
      badge.className = 'agent-badge';
      badge.textContent = agent.badge;

      top.appendChild(name);
      top.appendChild(badge);

      const sub = document.createElement('span');
      sub.className = 'agent-sub';
      sub.textContent = agent.subtitle;

      body.appendChild(top);
      body.appendChild(sub);

      const status = document.createElement('span');
      status.className =
        'agent-status' + (agent.status === 'online' ? ' online' : '');
      status.title = agent.status === 'online' ? '在线' : '离线';
      status.setAttribute('aria-hidden', 'true');

      selectBtn.appendChild(avatar);
      selectBtn.appendChild(body);
      selectBtn.appendChild(status);

      const pushBtn = document.createElement('button');
      pushBtn.type = 'button';
      pushBtn.className = 'agent-push-biz capsule-btn';
      pushBtn.textContent = '推送到业务空间';
      pushBtn.title = '推送为业务空间 AI员工 候选';
      pushBtn.dataset.pushAgentId = agent.id;

      row.appendChild(selectBtn);
      row.appendChild(pushBtn);
      listEl.appendChild(row);
    }
  }

  function wire(handlers: {
    onSelect: (agentId: string) => void;
    onPushToBiz?: (agent: DevAgent) => void;
  }): void {
    onPush = handlers.onPushToBiz;
    if (wired) return;
    wired = true;
    listEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const push = t.closest('button.agent-push-biz') as HTMLElement | null;
      if (push?.dataset.pushAgentId) {
        e.preventDefault();
        e.stopPropagation();
        const agent = DEV_AGENTS.find((a) => a.id === push.dataset.pushAgentId);
        if (agent && onPush) onPush(agent);
        return;
      }
      const row = t.closest('button.agent-select') as HTMLElement | null;
      if (row?.dataset.agentId) {
        handlers.onSelect(row.dataset.agentId);
      }
    });
  }

  return {
    render,
    wire,
    getAgents: () => DEV_AGENTS,
  };
}
