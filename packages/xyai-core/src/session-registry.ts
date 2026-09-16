/** SessionRegistry stub — 进程内会话登记，后续可换持久化 */

import type { Session, SessionId } from '@xyai/contracts';

export class SessionRegistry {
  private readonly sessions = new Map<SessionId, Session>();

  create(input: Omit<Session, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): Session {
    const now = new Date().toISOString();
    const session: Session = {
      ...input,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: SessionId): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  touch(id: SessionId): Session | undefined {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;
    const updated: Session = { ...existing, updatedAt: new Date().toISOString() };
    this.sessions.set(id, updated);
    return updated;
  }

  remove(id: SessionId): boolean {
    return this.sessions.delete(id);
  }
}
