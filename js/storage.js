import { KEYS, SEED_BOOKS, STORAGE_PREFIX } from './config.js';
import { fail, ok } from './result.js';

const probe = (getter) => {
  try {
    const store = getter();
    const key = `${STORAGE_PREFIX}__probe`;
    store.setItem(key, '1');
    store.removeItem(key);
    return store;
  } catch {
    return null;
  }
};

const sharedStore = probe(() => globalThis.localStorage);
const tabStore = probe(() => globalThis.sessionStorage);

const sharedMemory = new Map();
const tabMemory = new Map();

const scope = (store, memory) => ({
  alive: store !== null,
  read: (key) => (store ? store.getItem(key) : memory.has(key) ? memory.get(key) : null),
  write: (key, text) => {
    if (store) store.setItem(key, text);
    else memory.set(key, text);
  },
  drop: (key) => {
    if (store) store.removeItem(key);
    else memory.delete(key);
  },
  keys: () => (store ? Object.keys(store) : [...memory.keys()]),
});

const data = scope(sharedStore, sharedMemory);
const tab = scope(tabStore, tabMemory);

const isQuotaError = (error) =>
  error?.name === 'QuotaExceededError' ||
  error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
  error?.code === 22 ||
  error?.code === 1014;

const read = (area, key, fallback) => {
  const text = area.read(key);
  if (typeof text !== 'string' || text === '') return fallback;

  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
};

const write = (area, key, value) => {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return fail('DATA_RUSAK');
  }

  if (typeof text !== 'string') return fail('DATA_RUSAK');

  try {
    area.write(key, text);
    return ok(text);
  } catch (error) {
    return fail(isQuotaError(error) ? 'PENYIMPANAN_PENUH' : 'DATA_RUSAK');
  }
};

export const isPersistent = () => data.alive;

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const load = (key, fallback = null) => read(data, key, fallback);

export const save = (key, value) => write(data, key, value);

export const forget = (key) => {
  data.drop(key);
  return ok(null);
};

export const loadTab = (key, fallback = null) => read(tab, key, fallback);

export const saveTab = (key, value) => write(tab, key, value);

export const forgetTab = (key) => {
  tab.drop(key);
  return ok(null);
};

export function commit(key, reducer, attempts = 4) {
  for (let round = 0; round < attempts; round += 1) {
    const outcome = reducer(load(key, null));
    if (outcome?.ok !== true) return outcome ?? fail('DATA_RUSAK');

    const written = write(data, key, outcome.data);
    if (!written.ok) return written;
    if (data.read(key) === written.data) return outcome;
  }

  return fail('DATA_RUSAK');
}

export function nextLoanId() {
  const meta = load(KEYS.meta, null);
  const counter = Number.isSafeInteger(meta?.loanCounter) ? meta.loanCounter : 0;
  const next = counter + 1;
  save(KEYS.meta, { ...meta, loanCounter: next });
  return `PJ-${String(next).padStart(4, '0')}`;
}

export function seedIfEmpty() {
  const meta = load(KEYS.meta, null);
  const books = load(KEYS.books, null);

  if ((Array.isArray(books) && books.length > 0) || meta?.seeded === true) return ok(false);

  const now = Date.now();
  const seeded = SEED_BOOKS.map((book) => ({
    id: uid(),
    ...book,
    createdAt: now,
    updatedAt: now,
  }));

  const written = save(KEYS.books, seeded);
  if (!written.ok) return written;

  save(KEYS.meta, {
    loanCounter: Number.isSafeInteger(meta?.loanCounter) ? meta.loanCounter : 0,
    seeded: true,
  });

  return ok(true);
}

export function resetAll() {
  [...data.keys(), ...tab.keys()]
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => {
      data.drop(key);
      tab.drop(key);
    });

  return seedIfEmpty();
}

export function onExternalWrite(handler) {
  const listener = (event) => {
    if (sharedStore && event.storageArea !== sharedStore) return;
    if (event.key !== null && !event.key?.startsWith(STORAGE_PREFIX)) return;
    handler(event);
  };

  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}