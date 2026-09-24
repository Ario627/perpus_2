import {
  BOOK_STATUS,
  KATEGORI,
  KEYS,
  KODE_PREFIX,
  KODE_REGEX,
  LIMITS,
  POPULAR_LIMIT,
  POPULAR_MIN_LOANS,
  STATUS,
} from './config.js';
import { fail, ok } from './result.js';
import { commit, load, uid } from './storage.js';

const collator = new Intl.Collator('id-ID', { numeric: true, sensitivity: 'base' });
const kosong = Object.freeze({ dipesan: 0, dipinjam: 0 });
const KODE_TERPAKAI = 'Kode sudah dipakai.';

const asList = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const fold = (value) => text(value).toLocaleLowerCase('id-ID');
const int = (value) => (Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : Number.NaN);

export const readBooks = () => asList(load(KEYS.books, []));

export const listBooks = () => readBooks().slice().sort((a, b) => collator.compare(a.kode, b.kode));

export const findBook = (kode) => {
  const target = text(kode).toUpperCase();
  return readBooks().find((book) => text(book.kode).toUpperCase() === target) ?? null;
};

export const findBookById = (id) => readBooks().find((book) => book.id === id) ?? null;

export const holdsStock = (loan, now = Date.now()) =>
  loan?.status === STATUS.DIPINJAM ||
  (loan?.status === STATUS.DIPESAN && Number(loan.batasAmbil) > now);

export function indexHolds(loans, now = Date.now()) {
  const index = new Map();

  for (const loan of asList(loans)) {
    if (!holdsStock(loan, now)) continue;
    const kode = String(loan.bookKode);
    const bucket = index.get(kode) ?? { ...kosong };
    if (loan.status === STATUS.DIPESAN) bucket.dipesan += 1;
    else bucket.dipinjam += 1;
    index.set(kode, bucket);
  }

  return index;
}

export function stockFor(book, holds = new Map()) {
  const total = Math.max(0, int(book?.stokTotal) || 0);
  const bucket = holds.get(book?.kode) ?? kosong;
  const terpakai = bucket.dipesan + bucket.dipinjam;

  return {
    total,
    dipesan: bucket.dipesan,
    dipinjam: bucket.dipinjam,
    terpakai,
    tersedia: Math.max(0, total - terpakai),
  };
}

export const getStock = (kode, holds = null) =>
  stockFor(findBook(kode), holds ?? indexHolds(load(KEYS.loans, [])));

export function statusOf(stock) {
  if (!stock || stock.tersedia > 0) return stock ? 'TERSEDIA' : 'TIDAK_TERSEDIA';
  if (stock.dipesan > 0 && stock.dipinjam > 0) return 'TIDAK_TERSEDIA';
  if (stock.dipesan > 0) return 'DIPESAN';
  if (stock.dipinjam > 0) return 'SEDANG_DIPINJAM';
  return 'TIDAK_TERSEDIA';
}

export function popularBooks(limit = POPULAR_LIMIT, loans = load(KEYS.loans, [])) {
  const tally = new Map();

  for (const loan of asList(loans)) {
    if (loan.status === STATUS.KEDALUWARSA) continue;
    const kode = String(loan.bookKode);
    tally.set(kode, (tally.get(kode) ?? 0) + 1);
  }

  return [...tally]
    .filter(([, jumlah]) => jumlah >= POPULAR_MIN_LOANS)
    .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
    .slice(0, Math.max(0, limit))
    .map(([kode, jumlah]) => ({ kode, jumlah }));
}

export function browse({ q = '', kategori = '', hanyaTersedia = false, now = Date.now() } = {}) {
  const loans = asList(load(KEYS.loans, []));
  const holds = indexHolds(loans, now);
  const populer = new Map(popularBooks(POPULAR_LIMIT, loans).map((row) => [row.kode, row.jumlah]));
  const terms = fold(q).split(' ').filter(Boolean);
  const kategoriDipilih = KATEGORI.includes(kategori) ? kategori : '';

  return readBooks()
    .map((book) => {
      const stock = stockFor(book, holds);
      const statusKey = statusOf(stock);

      return {
        book,
        stock,
        statusKey,
        status: BOOK_STATUS[statusKey],
        populer: populer.get(book.kode) ?? 0,
        jejak: fold([book.judul, book.penulis, book.kode, book.kategori, book.lokasiRak].join(' ')),
      };
    })
    .filter(
      (row) =>
        (!kategoriDipilih || row.book.kategori === kategoriDipilih) &&
        (!hanyaTersedia || row.stock.tersedia > 0) &&
        terms.every((term) => row.jejak.includes(term)),
    )
    .sort(
      (a, b) =>
        Number(b.stock.tersedia > 0) - Number(a.stock.tersedia > 0) ||
        b.populer - a.populer ||
        collator.compare(a.book.judul, b.book.judul),
    )
    .map(({ jejak, ...row }) => row);
}

export function summary(now = Date.now()) {
  const holds = indexHolds(load(KEYS.loans, []), now);
  const acc = { judul: 0, eksemplar: 0, tersedia: 0, dipesan: 0, dipinjam: 0 };

  for (const book of readBooks()) {
    const stock = stockFor(book, holds);
    acc.judul += 1;
    acc.eksemplar += stock.total;
    acc.tersedia += stock.tersedia;
    acc.dipesan += stock.dipesan;
    acc.dipinjam += stock.dipinjam;
  }

  acc.sirkulasi = acc.dipesan + acc.dipinjam;
  return acc;
}

export function suggestKode(books = readBooks()) {
  const tertinggi = books.reduce((max, book) => {
    const match = KODE_REGEX.exec(text(book?.kode).toUpperCase());
    return match ? Math.max(max, int(match[0].slice(KODE_PREFIX.length))) : max;
  }, 0);

  return `${KODE_PREFIX}${String(tertinggi + 1).padStart(3, '0')}`;
}

const holdCountOf = (loans, kode) => {
  const bucket = indexHolds(loans).get(kode);
  return bucket ? bucket.dipesan + bucket.dipinjam : 0;
};

export function validateBookInput(
  input = {},
  { books = readBooks(), excludeId = null, holds = null, kodeTetap = null } = {},
) {
  const kode = kodeTetap ?? text(input.kode).toUpperCase();
  const judul = text(input.judul);
  const penulis = text(input.penulis);
  const kategori = text(input.kategori);
  const lokasiRak = text(input.lokasiRak);
  const stokTotal = int(input.stokTotal);
  const fields = {};

  if (!KODE_REGEX.test(kode)) fields.kode = 'Format kode seperti BK-001.';
  else if (books.some((book) => book.id !== excludeId && text(book.kode).toUpperCase() === kode))
    fields.kode = KODE_TERPAKAI;

  if (judul.length < LIMITS.judul.min || judul.length > LIMITS.judul.max)
    fields.judul = `Judul ${LIMITS.judul.min}–${LIMITS.judul.max} karakter.`;

  if (penulis.length < LIMITS.penulis.min || penulis.length > LIMITS.penulis.max)
    fields.penulis = `Penulis ${LIMITS.penulis.min}–${LIMITS.penulis.max} karakter.`;

  if (!KATEGORI.includes(kategori)) fields.kategori = 'Pilih kategori.';

  if (!lokasiRak || lokasiRak.length > LIMITS.rak.max)
    fields.lokasiRak = `Lokasi rak maksimal ${LIMITS.rak.max} karakter.`;

  if (!Number.isInteger(stokTotal) || stokTotal < LIMITS.stok.min)
    fields.stokTotal = `Stok minimal ${LIMITS.stok.min} eksemplar.`;
  else if (stokTotal > LIMITS.stok.max) fields.stokTotal = `Stok maksimal ${LIMITS.stok.max} eksemplar.`;

  if (!fields.stokTotal && holds) {
    const terpakai = holdCountOf(holds, kode);
    if (terpakai > stokTotal) fields.stokTotal = `Stok tidak boleh kurang dari pinjaman aktif (${terpakai}).`;
  }

  const [pesan] = Object.values(fields);
  if (pesan) {
    const kode = fields.kode === KODE_TERPAKAI ? 'KODE_DUPLIKAT' : 'VALIDASI';
    return { ...fail(kode, pesan), fields };
  }

  return ok({ kode, judul, penulis, kategori, lokasiRak, stokTotal });
}

export function createBook(input = {}) {
  const valid = validateBookInput(input, { books: readBooks() });
  if (!valid.ok) return valid;

  const now = Date.now();
  const book = { id: uid(), ...valid.data, createdAt: now, updatedAt: now };
  let created = null;

  const written = commit(KEYS.books, (value) => {
    const list = asList(value);
    if (list.some((item) => text(item.kode).toUpperCase() === book.kode)) return fail('KODE_DUPLIKAT');

    created = book;
    return ok([...list, book]);
  });

  return written.ok ? ok(created) : written;
}

export function updateBook(id, input = {}) {
  const existing = findBookById(id);
  if (!existing) return fail('BUKU_TIDAK_ADA');

  const holds = indexHolds(load(KEYS.loans, []));
  const valid = validateBookInput(input, {
    books: readBooks(),
    excludeId: id,
    holds,
    kodeTetap: existing.kode,
  });
  if (!valid.ok) return valid;

  const patch = { ...valid.data, updatedAt: Date.now() };
  let updated = null;

  const written = commit(KEYS.books, (value) => {
    const list = asList(value);
    const index = list.findIndex((book) => book.id === id);
    if (index < 0) return fail('BUKU_TIDAK_ADA');

    const terpakai = holdCountOf(load(KEYS.loans, []), list[index].kode);
    if (terpakai > patch.stokTotal) {
      const pesan = `Stok tidak boleh kurang dari pinjaman aktif (${terpakai}).`;
      return { ...fail('VALIDASI', pesan), fields: { stokTotal: pesan } };
    }

    updated = { ...list[index], ...patch, id, kode: list[index].kode };
    const next = list.slice();
    next[index] = updated;
    return ok(next);
  });

  return written.ok ? ok(updated) : written;
}

export function deleteBook(id) {
  const written = commit(KEYS.books, (value) => {
    const list = asList(value);
    const book = list.find((item) => item.id === id);
    if (!book) return fail('BUKU_TIDAK_ADA');
    if (holdCountOf(load(KEYS.loans, []), book.kode) > 0) return fail('MASIH_DIPINJAM');

    return ok(list.filter((item) => item.id !== id));
  });

  return written.ok ? ok(true) : written;
}