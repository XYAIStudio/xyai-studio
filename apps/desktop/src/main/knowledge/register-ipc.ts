/**
 * IPC: mountLocal, listFiles, startParse, stopParse, setIndexDir,
 * listCloud, mountCloud, mountIma, listImaBases, search, getCitations, openCitation,
 * previewFile, saveChatNote.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { KnowledgeHost } from './knowledge-host.js';
import {
  countMeaningfulChars,
  extractTextFromFileAsync,
  PDF_MIN_MEANINGFUL_CHARS,
  type CloudProviderConfig,
  type CloudProviderId,
} from '@xyai/knowledge';

export function registerKnowledgeIpc(
  getHost: () => KnowledgeHost,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle('xyai:kb-get-state', () => getHost().getState());

  ipcMain.handle(
    'xyai:kb-set-index-dir',
    (_e, payload: { indexRoot?: unknown; kbId?: unknown }) => {
      const indexRoot =
        typeof payload?.indexRoot === 'string' ? payload.indexRoot : '';
      if (!indexRoot) {
        return { ok: true as const, state: getHost().getState() };
      }
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (kbId) return getHost().setMountIndexDir(kbId, indexRoot);
      return getHost().setIndexDir(indexRoot);
    },
  );

  ipcMain.handle('xyai:kb-pick-directory', async (_e, payload: { title?: unknown }) => {
    const win = BrowserWindow.getFocusedWindow() || getMainWindow();
    const title =
      typeof payload?.title === 'string' ? payload.title : '选择目录';
    const opts = {
      properties: ['openDirectory' as const],
      title,
    };
    const res = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths[0]) {
      return { ok: false as const, path: '' };
    }
    return { ok: true as const, path: res.filePaths[0] };
  });

  ipcMain.handle(
    'xyai:kb-mount-local',
    (
      _e,
      payload: { sourceRoot?: unknown; name?: unknown; indexRoot?: unknown },
    ) => {
      const sourceRoot =
        typeof payload?.sourceRoot === 'string' ? payload.sourceRoot : '';
      if (!sourceRoot) return getHost().getState();
      return getHost().mountLocal({
        sourceRoot,
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        indexRoot:
          typeof payload?.indexRoot === 'string' ? payload.indexRoot : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:kb-mount-cloud',
    (
      _e,
      payload: {
        name?: unknown;
        provider?: unknown;
        config?: unknown;
        indexRoot?: unknown;
      },
    ) => {
      const name =
        typeof payload?.name === 'string' ? payload.name : '云端知识库';
      const provider: CloudProviderId =
        payload?.provider === 'ima' ? 'ima' : 'http';
      const config = sanitizeCloudConfig(payload?.config, provider);
      return getHost().mountCloud({
        name,
        provider,
        config,
        indexRoot:
          typeof payload?.indexRoot === 'string' ? payload.indexRoot : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:kb-mount-ima',
    (
      _e,
      payload: {
        name?: unknown;
        clientId?: unknown;
        apiKey?: unknown;
        knowledgeBaseId?: unknown;
        baseUrl?: unknown;
        indexRoot?: unknown;
        useMock?: unknown;
      },
    ) => {
      const clientId =
        typeof payload?.clientId === 'string' ? payload.clientId : '';
      const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey : '';
      const knowledgeBaseId =
        typeof payload?.knowledgeBaseId === 'string'
          ? payload.knowledgeBaseId
          : '';
      return getHost().mountIma({
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        clientId,
        apiKey,
        knowledgeBaseId,
        baseUrl:
          typeof payload?.baseUrl === 'string' ? payload.baseUrl : undefined,
        indexRoot:
          typeof payload?.indexRoot === 'string' ? payload.indexRoot : undefined,
        useMock: payload?.useMock === true,
      });
    },
  );

  ipcMain.handle(
    'xyai:kb-list-ima-bases',
    async (
      _e,
      payload: {
        clientId?: unknown;
        apiKey?: unknown;
        baseUrl?: unknown;
        query?: unknown;
      },
    ) => {
      return getHost().listImaBases({
        clientId: typeof payload?.clientId === 'string' ? payload.clientId : '',
        apiKey: typeof payload?.apiKey === 'string' ? payload.apiKey : '',
        baseUrl:
          typeof payload?.baseUrl === 'string' ? payload.baseUrl : undefined,
        query: typeof payload?.query === 'string' ? payload.query : '',
      });
    },
  );

  ipcMain.handle(
    'xyai:kb-unmount',
    (_e, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) return getHost().getState();
      return getHost().unmount(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-list-files',
    (_e, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) {
        return { ok: false, files: [], skipped: [], message: 'missing kbId' };
      }
      return getHost().listFiles(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-list-cloud',
    async (_e, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) {
        return {
          ok: false,
          files: [],
          stub: false,
          message: 'missing kbId',
        };
      }
      return getHost().listCloud(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-start-parse',
    async (event, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) return { error: 'missing kbId' };
      const sender = event.sender;
      // Re-bind progress to this sender for the run
      const host = getHost();
      // Progress is already wired via host events in main.ts
      void sender;
      return host.startParse(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-stop-parse',
    (_e, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) return null;
      return getHost().stopParse(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-parse-job',
    (_e, payload: { kbId?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      if (!kbId) return null;
      return getHost().getParseJob(kbId);
    },
  );

  ipcMain.handle(
    'xyai:kb-save-distill',
    async (_e, payload: { kbId?: unknown; outDir?: unknown }) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      const outDir = typeof payload?.outDir === 'string' ? payload.outDir : '';
      if (!kbId || !outDir) {
        return { ok: false, message: 'missing kbId or outDir' };
      }
      return getHost().saveDistill(kbId, outDir);
    },
  );

  ipcMain.handle(
    'xyai:kb-save-note',
    (
      _e,
      payload: {
        kbId?: unknown;
        destDir?: unknown;
        filename?: unknown;
        markdown?: unknown;
      },
    ) => {
      const markdown =
        typeof payload?.markdown === 'string' ? payload.markdown : '';
      const filename =
        typeof payload?.filename === 'string' ? payload.filename : 'note.md';
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      const destDir =
        typeof payload?.destDir === 'string' ? payload.destDir : '';
      return getHost().saveChatNote({
        kbId: kbId || undefined,
        destDir: destDir || undefined,
        filename,
        markdown,
      });
    },
  );


  ipcMain.handle(
    'xyai:kb-preview-file',
    async (
      _e,
      payload: {
        kbId?: unknown;
        path?: unknown;
        relativePath?: unknown;
        parseStatus?: unknown;
      },
    ) => {
      const kbId = typeof payload?.kbId === 'string' ? payload.kbId : '';
      const filePath = typeof payload?.path === 'string' ? payload.path : '';
      if (!kbId || !filePath) {
        return {
          ok: false,
          kind: 'error',
          filename: '',
          relativePath: '',
          ext: '',
          sizeBytes: 0,
          message: 'missing kbId or path',
        };
      }
      return getHost().previewFile({
        kbId,
        path: filePath,
        relativePath:
          typeof payload?.relativePath === 'string'
            ? payload.relativePath
            : undefined,
        parseStatus:
          typeof payload?.parseStatus === 'string'
            ? payload.parseStatus
            : undefined,
      });
    },
  );

  ipcMain.handle(
    'xyai:kb-search',
    async (
      _e,
      payload: { kbIds?: unknown; query?: unknown; limit?: unknown },
    ) => {
      const kbIds = Array.isArray(payload?.kbIds)
        ? payload.kbIds.filter((x): x is string => typeof x === 'string')
        : [];
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const limit =
        typeof payload?.limit === 'number' ? payload.limit : undefined;
      if (!query || !kbIds.length) {
        return {
          hits: [],
          citations: [],
          context: '',
          emptyIndexNames: [],
          emptyIndexNotes: [],
        };
      }
      return getHost().search({ kbIds, query, limit });
    },
  );

  ipcMain.handle(
    'xyai:kb-get-citations',
    async (
      _e,
      payload: { kbIds?: unknown; query?: unknown; limit?: unknown },
    ) => {
      const kbIds = Array.isArray(payload?.kbIds)
        ? payload.kbIds.filter((x): x is string => typeof x === 'string')
        : [];
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const limit =
        typeof payload?.limit === 'number' ? payload.limit : undefined;
      return getHost().getCitations({ kbIds, query, limit });
    },
  );

  ipcMain.handle(
    'xyai:extract-attachment',
    async (_e, payload: { path?: unknown }) => {
      const filePath = typeof payload?.path === 'string' ? payload.path : '';
      if (!filePath) {
        return {
          ok: false as const,
          text: '',
          warn: undefined,
          message: 'missing path',
        };
      }
      try {
        const res = await extractTextFromFileAsync(filePath);
        const text = (res.text || '').trim();
        const isPdf = filePath.toLowerCase().endsWith('.pdf');
        // PDF: ok:false when body too short / mostly metadata so chat can warn.
        const tooShort =
          isPdf && countMeaningfulChars(text) < PDF_MIN_MEANINGFUL_CHARS;
        if (tooShort) {
          return {
            ok: false as const,
            text,
            warn: res.warn,
            message:
              res.warn ||
              'PDF 未能提取到足够正文（可能是扫描件或仅含元数据）',
          };
        }
        return {
          ok: true as const,
          text,
          warn: res.warn,
          message: res.warn,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, text: '', message };
      }
    },
  );

  ipcMain.handle(
    'xyai:kb-open-citation',
    async (
      _e,
      payload: {
        sourcePath?: unknown;
        openHref?: unknown;
        showInFolder?: unknown;
      },
    ) => {
      const sourcePath =
        typeof payload?.sourcePath === 'string' ? payload.sourcePath : '';
      const openHref =
        typeof payload?.openHref === 'string' ? payload.openHref : '';
      const showInFolder = payload?.showInFolder === true;
      try {
        if (showInFolder && sourcePath) {
          shell.showItemInFolder(sourcePath);
          return { ok: true as const };
        }
        if (sourcePath && !/^https?:\/\//i.test(sourcePath)) {
          const err = await shell.openPath(sourcePath);
          if (err) return { ok: false as const, message: err };
          return { ok: true as const };
        }
        const url = openHref || sourcePath;
        if (url && /^https?:\/\//i.test(url)) {
          await shell.openExternal(url);
          return { ok: true as const };
        }
        if (url && url.startsWith('file://')) {
          const p = fileUrlToPath(url);
          const err = await shell.openPath(p);
          if (err) return { ok: false as const, message: err };
          return { ok: true as const };
        }
        return { ok: false as const, message: 'no path' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, message };
      }
    },
  );
}

function sanitizeCloudConfig(
  raw: unknown,
  provider: CloudProviderId,
): CloudProviderConfig {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const config: CloudProviderConfig = {
    baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl : '',
    clientId: typeof r.clientId === 'string' ? r.clientId : '',
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    knowledgeBaseId:
      typeof r.knowledgeBaseId === 'string' ? r.knowledgeBaseId : '',
    useMock: r.useMock === true,
    extra:
      r.extra && typeof r.extra === 'object'
        ? Object.fromEntries(
            Object.entries(r.extra as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : {},
  };
  if (provider === 'ima' && !config.baseUrl) {
    config.baseUrl = 'https://ima.qq.com/openapi/wiki/v1';
  }
  return config;
}

function fileUrlToPath(url: string): string {
  let p = url.replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:\//.test(p)) {
    p = p.slice(1);
  }
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}
