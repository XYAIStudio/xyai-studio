/**
 * Model hub row actions — 测速 / 注册 / 挂接 / 解挂.
 * 挂接/解挂 = set/clear the default chat model (FreeOS PUT/DELETE /local-models/default).
 */

export type HubActionId = 'speed' | 'register' | 'attach' | 'detach';

export type HubAction = {
  id: HubActionId;
  label: string;
};

export type HubModelView = {
  id: string;
  displayName: string;
  source?: string;
  path?: string;
  role?: string;
  registered: boolean;
  isDefault: boolean;
};

export function isProjectorModel(view: {
  displayName?: string;
  path?: string;
  role?: string;
  version?: string;
}): boolean {
  const blob = `${view.displayName || ''} ${view.path || ''} ${view.version || ''}`;
  return view.role === 'vision' || /mmproj|mm-proj|projector/i.test(blob);
}

export function chatModelRef(view: { id: string; displayName: string }): string {
  if (view.id.startsWith('ollama:')) return view.id;
  if (view.id.includes(':') && !view.id.startsWith('gguf:') && !view.id.startsWith('huggingface:')) {
    return view.id;
  }
  return `ollama:${view.displayName.replace(/\.(gguf|ggml)$/i, '')}`;
}

export function hubActionsFor(view: HubModelView): HubAction[] {
  const projector = isProjectorModel(view);
  const actions: HubAction[] = [];
  if (!projector) {
    actions.push({ id: 'speed', label: '测速' });
  }
  if (!view.registered) {
    actions.push({ id: 'register', label: '注册' });
  }
  if (!projector) {
    actions.push(
      view.isDefault
        ? { id: 'detach', label: '解挂' }
        : { id: 'attach', label: '挂接' },
    );
  }
  return actions;
}

export function sourceLabel(source?: string): string {
  switch (source) {
    case 'gguf':
    case 'huggingface':
      return '磁盘';
    case 'lmstudio':
      return 'LM Studio 目录';
    case 'manual':
      return '手动扫描';
    case 'catalog':
      return '目录';
    default:
      return 'Ollama';
  }
}
