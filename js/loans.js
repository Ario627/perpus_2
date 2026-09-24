import {
  ACTIVE_STATUS,
  HISTORY_STATUS,
  KEYS,
  KODE_REGEX,
  LOAN_HOLD_MS,
  LOAN_KODE_REGEX,
  MAX_ACTIVE_LOANS,
  ROLES,
  STATUS,
  TRANSITIONS,
} from './config.js';
import { findBook, holdsStock, indexHolds, readBooks, stockFor } from './books.js';
import { fail, ok } from './result.js';
import { normalizeIdentity, ownerKeyOfLoan, validateIdentity } from './session.js';
import { commit, load, nextLoanId } from './storage.js';

const asList = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const kodeOf = (value) => text(value).toUpperCase();
const stampOf = (loan) => loan?.dikembalikanPada ?? loan?.kedaluwarsaPada ?? loan?.diajukanPada ?? 0;

export const SCAN_SOURCE = Object.freeze({ BUKU: 'BUKU', PENGAJUAN: 'PENGAJUAN' });

const awaitingPickup = (now) =>
  asList(load(KEYS.loans, []))
    .filter((loan) => loan.status === STATUS.DIPESAN && holdsStock(loan, now))
    .sort((a, b) => Number(a.diajukanPada) - Number(b.diajukanPada));

export function effectiveStatus(loan, now = Date.now()) {
  if (!loan) return null;
  if (loan.status === STATUS.DIPESAN && !holdsStock(loan, now)) return STATUS.KEDALUWARSA;
  return loan.status;
}

export function changeStatus(loan, next, now = Date.now()) {
  const izin = TRANSITIONS[loan?.status] ?? [];
  if (!izin.includes(next)) return fail('STATUS_TIDAK_VALID', `Tidak bisa ${loan?.status ?? '—'} → ${next}.`);

  const moved = { ...loan, status: next };
  if (next === STATUS.DIPINJAM) moved.dipinjamPada = now;
  if (next === STATUS.DIKEMBALIKAN) moved.dikembalikanPada = now;
  if (next === STATUS.KEDALUWARSA) moved.kedaluwarsaPada = now;

  return ok(moved);
}

const expireInPlace = (loan, now) => {
  if (loan.status !== STATUS.DIPESAN || Number(loan.batasAmbil) > now) return loan;
  const moved = changeStatus(loan, STATUS.KEDALUWARSA, now);
  return moved.ok ? moved.data : loan;
};

const reserveId = (list) => {
  let id = nextLoanId();
  while (list.some((loan) => loan.id === id)) id = nextLoanId();
  return id;
};

export function expireOverdueLoans(now = Date.now()) {
  const due = asList(load(KEYS.loans, [])).filter(
    (loan) => loan.status === STATUS.DIPESAN && Number(loan.batasAmbil) <= now,
  );
  if (due.length === 0) return 0;

  const targets = new Set(due.map((loan) => loan.id));
  let expired = 0;

  const written = commit(KEYS.loans, (value) => {
    let hits = 0;

    const next = asList(value).map((loan) => {
      if (!targets.has(loan.id) || loan.status !== STATUS.DIPESAN || Number(loan.batasAmbil) > now) return loan;
      hits += 1;
      return expireInPlace(loan, now);
    });

    expired = hits;
    return ok(next);
  });

  return written.ok ? expired : 0;
}

export function createLoan({ kode, namaSiswa, kelas } = {}, session = null) {
  const identity = validateIdentity({
    role: session?.role ?? ROLES.SISWA,
    nama: namaSiswa ?? session?.nama,
    kelas: kelas ?? session?.kelas,
  });
  if (!identity.ok) return identity;

  const bookKode = kodeOf(kode);
  if (!findBook(bookKode)) return fail('BUKU_TIDAK_ADA');

  const now = Date.now();
  const pemilik = normalizeIdentity(identity.data.nama, identity.data.kelas);
  let created = null;

  const written = commit(KEYS.loans, (value) => {
    const list = asList(value).map((loan) => expireInPlace(loan, now));
    const book = findBook(bookKode);
    if (!book) return fail('BUKU_TIDAK_ADA');

    const stock = stockFor(book, indexHolds(list, now));
    if (stock.tersedia < 1) return fail('STOK_HABIS');

    const aktif = list.filter(
      (loan) => ownerKeyOfLoan(loan) === pemilik && ACTIVE_STATUS.includes(loan.status),
    );
    if (aktif.some((loan) => loan.bookKode === bookKode)) return fail('DUPLIKAT_AKTIF');
    if (aktif.length >= MAX_ACTIVE_LOANS) return fail('BATAS_PINJAM');

    created = {
      id: reserveId(list),
      bookKode,
      bookJudul: book.judul,
      namaSiswa: identity.data.nama,
      kelas: identity.data.kelas,
      status: STATUS.DIPESAN,
      diajukanPada: now,
      batasAmbil: now + LOAN_HOLD_MS,
      dipinjamPada: null,
      dikembalikanPada: null,
      kedaluwarsaPada: null,
    };

    return ok([...list, created]);
  });

  return written.ok ? ok(created) : written;
}

export function findScanCandidates(kode, now = Date.now()) {
  const bookKode = kodeOf(kode);
  if (!findBook(bookKode)) return fail('BUKU_TIDAK_ADA');

  const candidates = awaitingPickup(now).filter((loan) => loan.bookKode === bookKode);
  return candidates.length > 0 ? ok(candidates) : fail('TIDAK_ADA_PENGAJUAN');
}

export function findScanTarget(kode, now = Date.now()) {
  const code = kodeOf(kode);
  if (!code) return fail('QR_TIDAK_DIKENALI');

  if (LOAN_KODE_REGEX.test(code)) {
    const loan = asList(load(KEYS.loans, [])).find((item) => item.id === code);
    if (!loan) return fail('TIDAK_ADA_PENGAJUAN');
    if (loan.status === STATUS.KEDALUWARSA) return fail('KEDALUWARSA');
    if (loan.status !== STATUS.DIPESAN) return fail('STATUS_TIDAK_VALID');
    if (!holdsStock(loan, now)) return fail('KEDALUWARSA');

    return ok({ sumber: SCAN_SOURCE.PENGAJUAN, kandidat: [loan] });
  }

  if (!KODE_REGEX.test(code)) return fail('QR_TIDAK_DIKENALI');
  if (!findBook(code)) return fail('BUKU_TIDAK_ADA');

  const kandidat = awaitingPickup(now).filter((loan) => loan.bookKode === code);
  if (kandidat.length === 0) return fail('TIDAK_ADA_PENGAJUAN');

  return ok({ sumber: SCAN_SOURCE.BUKU, kandidat });
}

export function verifyAndBorrow(loanId, scannedKode) {
  const now = Date.now();
  const bookKode = kodeOf(scannedKode);
  let taken = null;

  const written = commit(KEYS.loans, (value) => {
    const list = asList(value).map((loan) => expireInPlace(loan, now));
    const index = list.findIndex((loan) => loan.id === loanId);
    if (index < 0) return fail('TIDAK_ADA_PENGAJUAN');

    const loan = list[index];
    if (loan.status === STATUS.KEDALUWARSA) return fail('KEDALUWARSA');
    if (loan.status !== STATUS.DIPESAN) return fail('STATUS_TIDAK_VALID');
    if (loan.bookKode !== bookKode) return fail('KODE_TIDAK_COCOK');

    const moved = changeStatus(loan, STATUS.DIPINJAM, now);
    if (!moved.ok) return moved;

    taken = moved.data;
    const next = list.slice();
    next[index] = taken;
    return ok(next);
  });

  return written.ok ? ok(taken) : written;
}

export function returnLoan(loanId, { kodeBuku, namaSiswa, kelas } = {}) {
  const now = Date.now();
  const pemilik = normalizeIdentity(namaSiswa, kelas);
  const bookKode = kodeOf(kodeBuku);
  let closed = null;

  const written = commit(KEYS.loans, (value) => {
    const list = asList(value).map((loan) => expireInPlace(loan, now));
    const index = list.findIndex((loan) => loan.id === loanId);
    if (index < 0) return fail('TIDAK_ADA_PENGAJUAN');

    const loan = list[index];
    if (ownerKeyOfLoan(loan) !== pemilik) return fail('BUKAN_PEMILIK');
    if (loan.status !== STATUS.DIPINJAM) return fail('STATUS_TIDAK_VALID');
    if (loan.bookKode !== bookKode) return fail('KODE_TIDAK_COCOK');

    const moved = changeStatus(loan, STATUS.DIKEMBALIKAN, now);
    if (!moved.ok) return moved;

    closed = moved.data;
    const next = list.slice();
    next[index] = closed;
    return ok(next);
  });

  return written.ok ? ok(closed) : written;
}

export function loansFor(nama, kelas, now = Date.now()) {
  const pemilik = normalizeIdentity(nama, kelas);

  const rows = asList(load(KEYS.loans, []))
    .filter((loan) => ownerKeyOfLoan(loan) === pemilik)
    .map((loan) => ({ loan, statusKey: effectiveStatus(loan, now) }));

  const aktif = rows
    .filter((row) => ACTIVE_STATUS.includes(row.statusKey))
    .sort((a, b) =>
      a.statusKey === b.statusKey
        ? a.statusKey === STATUS.DIPESAN
          ? Number(a.loan.batasAmbil) - Number(b.loan.batasAmbil)
          : Number(b.loan.dipinjamPada ?? 0) - Number(a.loan.dipinjamPada ?? 0)
        : a.statusKey === STATUS.DIPESAN
          ? -1
          : 1,
    );

  const riwayat = rows
    .filter((row) => HISTORY_STATUS.includes(row.statusKey))
    .sort((a, b) => stampOf(b.loan) - stampOf(a.loan));

  return { aktif, riwayat };
}

export function quotaFor(nama, kelas, now = Date.now()) {
  const pemilik = normalizeIdentity(nama, kelas);
  const used = asList(load(KEYS.loans, [])).filter(
    (loan) => ownerKeyOfLoan(loan) === pemilik && holdsStock(loan, now),
  ).length;

  return { used, max: MAX_ACTIVE_LOANS, sisa: Math.max(0, MAX_ACTIVE_LOANS - used) };
}

export function pendingLoans(now = Date.now()) {
  const shelf = new Map(readBooks().map((book) => [book.kode, book]));

  return asList(load(KEYS.loans, []))
    .filter((loan) => loan.status === STATUS.DIPESAN && Number(loan.batasAmbil) > now)
    .sort((a, b) => Number(a.batasAmbil) - Number(b.batasAmbil))
    .map((loan) => ({
      loan,
      statusKey: STATUS.DIPESAN,
      sisa: Number(loan.batasAmbil) - now,
      book: shelf.get(loan.bookKode) ?? null,
    }));
}

export function listLoans({ status = '', q = '' } = {}, now = Date.now()) {
  const terms = text(q).toLocaleLowerCase('id-ID').split(' ').filter(Boolean);
  const saring = Object.values(STATUS).includes(status) ? status : '';

  return asList(load(KEYS.loans, []))
    .map((loan) => ({ loan, statusKey: effectiveStatus(loan, now) }))
    .filter((row) => !saring || row.statusKey === saring)
    .filter((row) => {
      if (terms.length === 0) return true;
      const jejak = text(
        `${row.loan.id} ${row.loan.namaSiswa} ${row.loan.kelas} ${row.loan.bookJudul} ${row.loan.bookKode}`,
      ).toLocaleLowerCase('id-ID');
      return terms.every((term) => jejak.includes(term));
    })
    .sort((a, b) => Number(b.loan.diajukanPada ?? 0) - Number(a.loan.diajukanPada ?? 0));
}