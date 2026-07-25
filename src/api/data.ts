import { base44 } from './base44Client';

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  context_notes: string;
}

export type EntryType = 'summary' | 'doc' | 'rec';

export interface Entry {
  id: string;
  patient_id: string;
  type: EntryType;
  title: string;
  entry_date: string;
  body: string;
  is_draft: boolean;
  duration_seconds: number;
  transcript: string;
}

export interface ChatMsg {
  role: 'user' | 'dror';
  text: string;
  ts: string;
}

export interface Chat {
  id: string;
  title: string;
  patient_id: string;
  messages: ChatMsg[];
}

// Auth wrapper — method names/shapes follow the documented @base44/sdk AuthModule
// (base44.auth.register/verifyOtp/loginViaEmailPassword/me/logout), not the brief's
// original signup() sketch. register() takes an optional fullName for UI symmetry;
// RegisterParams itself has no full_name field (see docs/context/base44-facts.md
// section 3), so it's forwarded best-effort and not guaranteed to persist — callers
// that need the display name to stick should call base44.auth.updateMe({ full_name })
// once the user is authenticated (after verifyOtp + login).
export const auth = {
  me: (): Promise<{ email: string; full_name?: string } | null> =>
    base44.auth.me()
      .then(u => ({ email: u.email, full_name: u.full_name ?? undefined }))
      .catch(() => null),

  login: (email: string, password: string): Promise<void> =>
    base44.auth.loginViaEmailPassword(email, password).then(() => undefined),

  register: (email: string, password: string, fullName?: string): Promise<void> => {
    const params: Record<string, unknown> = { email, password };
    if (fullName) params.full_name = fullName;
    return base44.auth
      .register(params as unknown as Parameters<typeof base44.auth.register>[0])
      .then(() => undefined);
  },

  verifyOtp: (email: string, otp: string): Promise<void> =>
    base44.auth.verifyOtp({ email, otpCode: otp }).then(() => undefined),

  logout: (): Promise<void> => {
    base44.auth.logout();
    return Promise.resolve();
  },
};

export const listPatients = (): Promise<Patient[]> => base44.entities.Patient.list();

export const createPatient = (first: string, last: string): Promise<Patient> =>
  base44.entities.Patient.create({ first_name: first, last_name: last, context_notes: '' });

export const updatePatientNotes = (id: string, notes: string): Promise<void> =>
  base44.entities.Patient.update(id, { context_notes: notes }).then(() => undefined);

export const listEntries = (patientId: string): Promise<Entry[]> =>
  base44.entities.Entry.filter({ patient_id: patientId }, '-entry_date');

export const createEntry = (e: Omit<Entry, 'id'>): Promise<Entry> => base44.entities.Entry.create(e);

export const updateEntry = (id: string, patch: Partial<Entry>): Promise<void> =>
  base44.entities.Entry.update(id, patch).then(() => undefined);

export const listChats = (): Promise<Chat[]> => base44.entities.Chat.list('-updated_date');

export const createChat = (c: { title: string; patient_id: string; messages: ChatMsg[] }): Promise<Chat> =>
  base44.entities.Chat.create(c);

export const updateChatMessages = (id: string, messages: ChatMsg[]): Promise<void> =>
  base44.entities.Chat.update(id, { messages }).then(() => undefined);
