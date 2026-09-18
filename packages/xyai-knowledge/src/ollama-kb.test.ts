import { describe, expect, it } from 'vitest';
import {
  isNonChatModel,
  isToyChatModel,
  isAcceptableSummary,
  pickEmbedModel,
  pickFastChatModel,
  pickFastestLocalModel,
  pickBestChatModelForSummary,
  sizeHint,
} from './ollama-kb.js';

/** Real-ish tag list from user machine (no embed models). */
const USER_MODELS = [
  'qwen3.6-35b-a3b-qx86x-k_m',
  'gemma-4-12b',
  'gemma-3-270m-it-q4_k_m',
  'minicpm5-1b-q4_k_m',
  'qwen3-1.7b-q4_k_m',
  'qwen2.5-coder-3b',
  'qwen3-5-2b',
  'deepseek-v4-flash',
  'qwen2.5vl:3b',
  'gemma3:4b',
  'qwen3:8b',
  'mmproj-gemma3',
  'mmproj-qwen2.5vl',
];

describe('sizeHint', () => {
  it('parses m and b tags from real Ollama names', () => {
    expect(sizeHint('gemma-3-270m-it-q4_k_m')).toBeCloseTo(0.27, 5);
    expect(sizeHint('qwen3-1.7b-q4_k_m')).toBeCloseTo(1.7, 5);
    expect(sizeHint('minicpm5-1b-q4_k_m')).toBe(1);
    expect(sizeHint('qwen2.5vl:3b')).toBe(3);
    expect(sizeHint('gemma3:4b')).toBe(4);
    expect(sizeHint('qwen3:8b')).toBe(8);
    expect(sizeHint('gemma-4-12b')).toBe(12);
    expect(sizeHint('qwen3.6-35b-a3b-qx86x-k_m')).toBe(35);
  });
});

describe('isNonChatModel', () => {
  it('excludes mmproj and embed adapters', () => {
    expect(isNonChatModel('mmproj-gemma3')).toBe(true);
    expect(isNonChatModel('nomic-embed-text')).toBe(true);
    expect(isNonChatModel('gemma-3-270m-it-q4_k_m')).toBe(false);
  });
});

describe('isToyChatModel', () => {
  it('marks 270m / sub-1.5B as toy', () => {
    expect(isToyChatModel('gemma-3-270m-it-q4_k_m')).toBe(true);
    expect(isToyChatModel('qwen3:8b')).toBe(false);
    expect(isToyChatModel('qwen3-1.7b-q4_k_m')).toBe(false);
  });
});

describe('pickFastChatModel / pickFastestLocalModel', () => {
  it('skips toy 270m when larger chat models exist', () => {
    const picked = pickFastChatModel(USER_MODELS);
    expect(picked).toBeTruthy();
    expect(picked).not.toMatch(/mmproj/i);
    expect(picked).not.toMatch(/270m/i);
    expect(String(picked)).not.toMatch(/35b/i);
    expect(pickFastestLocalModel(USER_MODELS)).toBe(picked);
  });

  it('returns null when only mmproj/embed remain', () => {
    expect(pickFastChatModel(['mmproj-x', 'nomic-embed-text'])).toBeNull();
  });
});

describe('pickBestChatModelForSummary', () => {
  it('prefers qwen3:8b over gemma 270m', () => {
    const best = pickBestChatModelForSummary([
      'gemma-3-270m-it-q4_k_m',
      'qwen3:8b',
      'mmproj-gemma3',
    ]);
    expect(best).toBe('qwen3:8b');
  });
});

describe('isAcceptableSummary', () => {
  it('rejects repetitive English loops on Chinese source', () => {
    expect(
      isAcceptableSummary(
        'Document on Requirements Document on Requirements Document on Requirements Document on Requirements',
        '国务院办公厅关于绿色低碳发展的若干意见' + '内容条款' * 30,
      ),
    ).toBe(false);
  });
  it('accepts short Chinese summary', () => {
    expect(
      isAcceptableSummary(
        '该文件明确了绿色低碳发展的主要目标和政策措施。',
        '国务院办公厅关于绿色低碳发展的若干意见' + '内容条款' * 30,
      ),
    ).toBe(true);
  });
});

describe('pickEmbedModel', () => {
  it('returns null on chat-only user list', () => {
    expect(pickEmbedModel(USER_MODELS)).toBeNull();
  });

  it('picks nomic when present', () => {
    expect(pickEmbedModel([...USER_MODELS, 'nomic-embed-text'])).toBe(
      'nomic-embed-text',
    );
  });
});
