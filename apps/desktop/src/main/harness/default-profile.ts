/**
 * In-process copy of assembly/profiles/0.5.0-dev.example.json harness rows.
 * Packaged Electron may not ship the JSON next to cwd; keep ids in sync.
 */

import type { AssemblyProfile } from '@xyai/contracts';

export const DEFAULT_STUDIO_ASSEMBLY: AssemblyProfile = {
  productVersion: '0.5.0',
  profileId: '0.5.0-dev.example',
  harnesses: [
    {
      id: 'codex',
      adapter: 'adapter-codex',
      enabled: true,
      version: '0.151.0',
      pinnedBinaryNote:
        'Real binary via resolveCodexBinary; missing binary soft-falls back to local stream',
    },
    {
      id: 'dsh',
      adapter: 'adapter-dsh',
      enabled: false,
      version: 'stub',
      pinnedBinaryNote:
        'Disabled stub — implements AgentRuntime; not a user-facing brand choice',
    },
    {
      id: 'claude',
      adapter: 'adapter-claude',
      enabled: false,
      version: 'stub',
      pinnedBinaryNote: 'Disabled stub — implements AgentRuntime; coming soon',
    },
  ],
  modules: [
    { id: 'conversation', enabled: true },
    { id: 'model-catalog', enabled: true, optional: true },
    { id: 'approval', enabled: true, optional: true },
    { id: 'ai-employees', enabled: false, optional: true },
  ],
  components: [
    {
      id: 'openxyos',
      kind: 'submodule',
      path: 'components/openxyos',
      required: false,
    },
  ],
};
