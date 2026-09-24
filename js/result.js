import { ERRORS } from './config.js';

const FALLBACK = 'Operasi tidak dapat diselesaikan.';

export const ok = (data = null) => ({ ok: true, data });

export const fail = (code, message) => ({
  ok: false,
  code,
  message: message ?? ERRORS[code] ?? FALLBACK,
});

export const isOk = (result) => result?.ok === true;

export const unwrap = (result, fallback = null) => (isOk(result) ? result.data : fallback);