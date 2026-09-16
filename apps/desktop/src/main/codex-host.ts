/**
 * Main-process Codex host — SessionRegistry + createCodexAdapter.
 * Renderer never imports adapters; all turns go through IPC.
 */

import { randomUUID } from 'node:crypto';
import { SessionRegistry } from '@xyai/core';
import {
  createCodexAdapter,
  resolveCodexBinary,
  type CodexAdapter,
  type CodexBinarySource,
} from '@xyai/adapter-codex';
import type { AgentEvent } from '@xyai/contracts';

export interface CodexHostStatus {
  isMock: boolean;
  binarySource: CodexBinarySource | null;
  binaryPath: string | null;
}

export class CodexHost {
  private readonly registry = new SessionRegistry();
  private readonly adapter: CodexAdapter;
  private readonly sessionId: string;
  private started = false;
  private sending = false;

  constructor() {
    this.adapter = createCodexAdapter();
    const session = this.registry.create({
      id: `ui-${randomUUID()}`,
      title: 'XYAI Studio',
      harnessId: 'codex',
    });
    this.sessionId = session.id;
  }

  getStatus(): CodexHostStatus {
    const resolved = resolveCodexBinary();
    return {
      isMock: this.adapter.isMock,
      binarySource: this.adapter.binarySource ?? resolved.source,
      binaryPath: this.adapter.binary.path ?? resolved.path,
    };
  }

  async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.adapter.start({
      sessionId: this.sessionId,
      harnessId: 'codex',
    });
    this.started = true;
  }

  async *sendMessage(content: string): AsyncIterable<AgentEvent> {
    const trimmed = content.trim();
    if (!trimmed) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        payload: { message: 'empty message' },
      };
      return;
    }

    await this.ensureStarted();

    if (this.sending) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        payload: { message: 'busy: wait for current turn' },
      };
      return;
    }

    this.sending = true;
    try {
      const taskId = `task-${randomUUID()}`;
      this.registry.touch(this.sessionId);
      yield* this.adapter.send({
        sessionId: this.sessionId,
        taskId,
        content: trimmed,
      });
    } finally {
      this.sending = false;
    }
  }

  async dispose(): Promise<void> {
    if (!this.started) return;
    await this.adapter.stop(this.sessionId);
    this.started = false;
  }
}
