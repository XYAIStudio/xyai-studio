import { describe, expect, it } from 'vitest';
import {
  advanceRollingSummary,
  emptySessionMemory,
  estimateChars,
  harvestFactsFromTurn,
  packMessagesForTurn,
  type ChatMessage,
} from './context-pack.js';

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return { role, content };
}

describe('context-pack handoff', () => {
  it('keeps recent verbatim and folds older into rolling summary', () => {
    const full: ChatMessage[] = [];
    for (let i = 0; i < 40; i++) {
      full.push(msg('user', `U${i} ` + '问'.repeat(20)));
      full.push(msg('assistant', `A${i} ` + '答'.repeat(20)));
    }
    let mem = emptySessionMemory();
    mem = advanceRollingSummary(full, mem, 8);
    expect(mem.summarizedThrough).toBe(full.length - 8);
    expect(mem.rollingSummary).toContain('会话迄今要点');
    expect(mem.rollingSummary).toContain('U0');

    const { messages } = packMessagesForTurn(full, mem, {
      recentCount: 8,
      durableFacts: ['用户叫 Anna'],
    });
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('长期记忆');
    expect(messages[0]?.content).toContain('Anna');
    expect(messages.some((m) => m.content.includes('U39'))).toBe(true);
    expect(estimateChars(messages)).toBeLessThan(estimateChars(full));
  });

  it('harvests simple preference facts', () => {
    const facts = harvestFactsFromTurn(
      '我叫Baker，请叫我 Anna',
      '好的，已记住：你希望被称作 Anna',
    );
    expect(facts.length).toBeGreaterThan(0);
  });
});
