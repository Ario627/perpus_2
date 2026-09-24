import { KEYS, LIMITS, ROLES, ROLE_LABEL, SESSION_KELAS_GURU } from './config.js';
import { fail, ok } from './result.js';
import { forgetTab, loadTab, saveTab } from './storage.js';

const ROLE_SET = new Set(Object.values(ROLES));

const clean = (value) => String(value ?? '').trim();
const fold = (value) => clean(value).toLowerCase();

export const normalizeIdentity = (nama, kelas) => `${fold(nama)}\u0000${fold(kelas)}`;

export const ownerKeyOfLoan = (loan) => normalizeIdentity(loan?.namaSiswa, loan?.kelas);

export const ownerKeyOfSession = (session) => normalizeIdentity(session?.nama, session?.kelas);

export const isOwner = (loan, session) => {
  if (!loan || !session || session.role === ROLES.PETUGAS) return false;
  return ownerKeyOfLoan(loan) === ownerKeyOfSession(session);
};

export const isPetugas = (session) => session?.role === ROLES.PETUGAS;

export function getSession() {
  const stored = loadTab(KEYS.session, null);
  if (!stored || !ROLE_SET.has(stored.role)) return null;
  if (stored.role === ROLES.PETUGAS) return { role: ROLES.PETUGAS };

  const nama = clean(stored.nama);
  const kelas = clean(stored.kelas);
  if (nama.length < LIMITS.nama.min || kelas.length < LIMITS.kelas.min) return null;

  return { role: stored.role, nama, kelas };
}

export const isSignedIn = () => getSession() !== null;

export const describe = (session) => !session ? '' : session.role === ROLES.PETUGAS ? ROLE_LABEL[ROLES.PETUGAS] : `${session.nama} · ${session.kelas}`;

export function validateIdentity(input = {}) {
  const role = ROLE_SET.has(input.role) ? input.role : ROLES.SISWA;
  const nama = clean(input.nama);
  const kelas = role === ROLES.GURU && !clean(input.kelas) ? SESSION_KELAS_GURU : clean(input.kelas);
  const fields = {};

  if (!nama) fields.nama = 'Nama wajib diisi.';
  else if (nama.length < LIMITS.nama.min) fields.nama = `Nama minimal ${LIMITS.nama.min} karakter.`;
  else if (nama.length > LIMITS.nama.max) fields.nama = `Nama maksimal ${LIMITS.nama.max} karakter.`;

  if (!kelas) fields.kelas = 'Kelas wajib diisi.';
  else if (kelas.length > LIMITS.kelas.max) fields.kelas = `Kelas maksimal ${LIMITS.kelas.max} karakter.`;

  const message = Object.values(fields)[0];
  if (message) return { ...fail('VALIDASI', message), fields };

  return ok({ role, nama, kelas });
}

export function signIn(input = {}) {
  const role = ROLE_SET.has(input.role) ? input.role : ROLES.SISWA;

  if (role === ROLES.PETUGAS) {
    const session = { role: ROLES.PETUGAS };
    const stored = saveTab(KEYS.session, session);
    return stored.ok ? ok(session) : stored;
  }

  const valid = validateIdentity({ ...input, role });
  if (!valid.ok) return valid;

  const session = valid.data;
  const stored = saveTab(KEYS.session, session);
  return stored.ok ? ok(session) : stored;
}

export const signOut = () => forgetTab(KEYS.session);