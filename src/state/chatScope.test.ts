import { describe, it, expect } from 'vitest';
import { deriveChatScope, type LiveChatLike } from './chatScope';

// Critical bug this guards: open patient A -> go Home -> start a GENERAL chat
// -> follow-up message must stay general, not re-scope to patient A's leftover
// activeId. The live chat on screen is the source of truth for scope; a NEW
// chat's scope comes from fromHome/activeId only when there is no live chat.
describe('deriveChatScope', () => {
  it('(a) live general chat + leftover activeId => general, not the leftover patient', () => {
    const live: LiveChatLike = { patientId: '', started: true };
    expect(deriveChatScope(false, live, 'patient-A')).toBe('');
    expect(deriveChatScope(true, live, 'patient-A')).toBe('');
  });

  it('(b) live patient-A chat stays scoped to A even when fromHome is true', () => {
    const live: LiveChatLike = { patientId: 'A', started: true };
    expect(deriveChatScope(true, live, null)).toBe('A');
    expect(deriveChatScope(true, live, 'other-leftover')).toBe('A');
  });

  it('(c) no live chat, fromHome => general', () => {
    expect(deriveChatScope(true, null, 'B')).toBe('');
  });

  it('(d) no live chat, from a patient screen => that patient', () => {
    expect(deriveChatScope(false, null, 'B')).toBe('B');
  });

  it('(e) no live chat, patient screen, null activeId => general', () => {
    expect(deriveChatScope(false, null, null)).toBe('');
  });

  it('a live chat that has not started yet (no id, no messages) is not "live" for scoping', () => {
    const live: LiveChatLike = { patientId: 'stale', started: false };
    expect(deriveChatScope(false, live, 'B')).toBe('B');
    expect(deriveChatScope(true, live, 'B')).toBe('');
  });
});
