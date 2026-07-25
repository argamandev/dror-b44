// Pure scope-derivation for sendChat. Extracted so the critical rule — a live
// chat's scope always wins over a leftover activeId — is independently testable.
//
// `started` means the chat on screen has actually begun (it has a persisted
// Chat id, or at least one message already sent/received). A never-started
// chat (e.g. right after openPatient/newChat resets to EMPTY_CHAT) is not
// "live" for scoping purposes — the fromHome/activeId rule applies instead.
export interface LiveChatLike {
  patientId: string;
  started: boolean;
}

export function deriveChatScope(
  fromHome: boolean,
  live: LiveChatLike | null,
  activePatientId: string | null
): string {
  if (live && live.started) return live.patientId;
  return fromHome ? '' : (activePatientId ?? '');
}
