export const STORAGE_PREFIX = 'pd:';

export const APP = Object.freeze({
  nama: 'Pustaka',
  tagline: 'Cek buku tanpa keliling rak',
  versi: '1.0.0',
});

export const KEYS = Object.freeze({
  books: `${STORAGE_PREFIX}books`,
  loans: `${STORAGE_PREFIX}loans`,
  meta: `${STORAGE_PREFIX}meta`,
  session: `${STORAGE_PREFIX}session`,
  pendingBukti: `${STORAGE_PREFIX}bukti`,
});

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

export const LOAN_HOLD_MINUTES = 60;
export const LOAN_HOLD_MS = LOAN_HOLD_MINUTES * MINUTE;
export const COUNTDOWN_INTERVAL_MS = SECOND;
export const EXPIRE_CHECK_INTERVAL_MS = 30 * SECOND;
export const SEARCH_DEBOUNCE_MS = 250;
export const SCAN_DEBOUNCE_MS = 3 * SECOND;
export const SCAN_RESUME_MS = 2 * SECOND;
export const DUE_SOON_MS = 10 * MINUTE;
export const TOAST_MS = 3_200;

export const MAX_ACTIVE_LOANS = 3;
export const POPULAR_MIN_LOANS = 2;
export const POPULAR_LIMIT = 3;

export const SCAN_FPS = 10;
export const SCAN_BOX = 250;
export const CAMERA_PROBE_MS = 1_500;

export const KATEGORI = Object.freeze([
  'Matematika',
  'Bahasa',
  'IPA',
  'IPS',
  'Produktif',
  'Fiksi',
  'Lainnya',
]);

export const KODE_PREFIX = 'BK-';
export const KODE_REGEX = /^BK-\d{3,}$/;
export const LOAN_PREFIX = 'PJ-';
export const LOAN_KODE_REGEX = /^PJ-\d{4,}$/;
export const PAYLOAD_PREFIX = 'PD1-';
export const PAYLOAD_REGEX = /^PD1-[A-Z2-7]{16,}$/;
export const RECEIPT_PREFIX = 'PD2-';
export const RECEIPT_REGEX = /^PD2-[A-Z2-7]{16,}$/;
export const RECEIPT_PARAM = 'bukti';

export const LIMITS = Object.freeze({
  nama: { min: 2, max: 60 },
  kelas: { min: 1, max: 20 },
  judul: { min: 3, max: 150 },
  penulis: { min: 2, max: 100 },
  rak: { max: 20 },
  stok: { min: 1, max: 999 },
});

export const STATUS = Object.freeze({
  DIPESAN: 'DIPESAN',
  DIPINJAM: 'DIPINJAM',
  DIKEMBALIKAN: 'DIKEMBALIKAN',
  KEDALUWARSA: 'KEDALUWARSA',
});

export const TRANSITIONS = Object.freeze({
  [STATUS.DIPESAN]: Object.freeze([STATUS.DIPINJAM, STATUS.KEDALUWARSA]),
  [STATUS.DIPINJAM]: Object.freeze([STATUS.DIKEMBALIKAN]),
  [STATUS.DIKEMBALIKAN]: Object.freeze([]),
  [STATUS.KEDALUWARSA]: Object.freeze([]),
});

export const ACTIVE_STATUS = Object.freeze([STATUS.DIPESAN, STATUS.DIPINJAM]);
export const HISTORY_STATUS = Object.freeze([STATUS.DIKEMBALIKAN, STATUS.KEDALUWARSA]);

export const STATUS_UI = Object.freeze({
  [STATUS.DIPESAN]: { label: 'Dipesan', tone: 'tunggu' },
  [STATUS.DIPINJAM]: { label: 'Sedang meminjam', tone: 'jalan' },
  [STATUS.DIKEMBALIKAN]: { label: 'Selesai', tone: 'tuntas' },
  [STATUS.KEDALUWARSA]: { label: 'Dibatalkan', tone: 'lewat' },
});

export const BOOK_STATUS = Object.freeze({
  TERSEDIA: { label: 'Tersedia', tone: 'tuntas' },
  DIPESAN: { label: 'Dipesan', tone: 'tunggu' },
  SEDANG_DIPINJAM: { label: 'Sedang dipinjam', tone: 'jalan' },
  TIDAK_TERSEDIA: { label: 'Tidak tersedia', tone: 'lewat' },
});

export const ROLES = Object.freeze({
  SISWA: 'siswa',
  GURU: 'guru',
  PETUGAS: 'petugas',
});

export const ROLE_LABEL = Object.freeze({
  [ROLES.SISWA]: 'Siswa',
  [ROLES.GURU]: 'Guru',
  [ROLES.PETUGAS]: 'Petugas',
});

export const SESSION_KELAS_GURU = 'Guru';

export const ROUTES = Object.freeze([
  {
    path: '#/masuk',
    modul: './ui/masuk.js',
    peran: null,
    judul: 'Masuk',
  },
  {
    path: '#/katalog',
    modul: './ui/katalog.js',
    peran: [ROLES.SISWA, ROLES.GURU, ROLES.PETUGAS],
    judul: 'Katalog',
  },
  {
    path: '#/pinjaman',
    modul: './ui/pinjaman.js',
    peran: [ROLES.SISWA, ROLES.GURU],
    judul: 'Pinjaman Saya',
  },
  {
    path: '#/admin/buku',
    modul: './ui/adminBuku.js',
    peran: [ROLES.PETUGAS],
    judul: 'Kelola Buku',
  },
  {
    path: '#/admin/scan',
    modul: './ui/adminScan.js',
    peran: [ROLES.PETUGAS],
    judul: 'Pengajuan & Scan',
  },
  {
    path: '#/admin/riwayat',
    modul: './ui/adminRiwayat.js',
    peran: [ROLES.PETUGAS],
    judul: 'Riwayat',
  },
]);

export const FALLBACK_ROUTE = '#/masuk';

export const HOME_ROUTE = Object.freeze({
  [ROLES.SISWA]: '#/katalog',
  [ROLES.GURU]: '#/katalog',
  [ROLES.PETUGAS]: '#/admin/buku',
});

export const NAV = Object.freeze({
  [ROLES.SISWA]: [
    { label: 'Katalog', short: 'Katalog', href: '#/katalog' },
    { label: 'Pinjaman Saya', short: 'Pinjaman', href: '#/pinjaman' },
  ],
  [ROLES.GURU]: [
    { label: 'Katalog', short: 'Katalog', href: '#/katalog' },
    { label: 'Pinjaman Saya', short: 'Pinjaman', href: '#/pinjaman' },
  ],
  [ROLES.PETUGAS]: [
    { label: 'Kelola Buku', short: 'Koleksi', href: '#/admin/buku' },
    { label: 'Scan', short: 'Scan', href: '#/admin/scan' },
    { label: 'Riwayat', short: 'Riwayat', href: '#/admin/riwayat' },
    { label: 'Katalog', short: 'Katalog', href: '#/katalog' },
  ],
});

export const ERRORS = Object.freeze({
  VALIDASI: 'Periksa kembali isian yang ditandai.',
  BUKU_TIDAK_ADA: 'Buku tidak ditemukan di katalog.',
  STOK_HABIS: 'Semua eksemplar sedang dipesan atau dipinjam.',
  DUPLIKAT_AKTIF: 'Kamu masih punya pinjaman aktif untuk judul ini.',
  BATAS_PINJAM: `Maksimal ${MAX_ACTIVE_LOANS} pinjaman aktif sekaligus.`,
  QR_TIDAK_DIKENALI: 'QR Code ini bukan milik Pustaka.',
  TIDAK_ADA_PENGAJUAN: 'Tidak ada pengajuan aktif untuk kode ini di perangkat ini.',
  KEDALUWARSA: `Batas ambil ${LOAN_HOLD_MINUTES} menit sudah lewat.`,
  STATUS_TIDAK_VALID: 'Perubahan status ini tidak diizinkan.',
  BUKAN_PEMILIK: 'Peminjaman ini bukan milikmu.',
  KODE_TIDAK_COCOK: 'Kode buku tidak cocok dengan pengajuan.',
  BUKTI_TIDAK_COCOK: 'Kode bukti ini bukan untuk pengajuan di perangkat ini.',
  KODE_DUPLIKAT: 'Kode buku sudah dipakai judul lain.',
  MASIH_DIPINJAM: 'Buku masih punya pinjaman aktif.',
  BELUM_MASUK: 'Masuk dulu untuk membuka halaman ini.',
  AKSES_DITOLAK: 'Halaman ini tidak tersedia untuk peranmu.',
  PENYIMPANAN_PENUH: 'Penyimpanan browser penuh.',
  DATA_RUSAK: 'Data lokal tidak terbaca.',
  KAMERA_GAGAL: 'Kamera tidak bisa dibuka.',
  KAMERA_DIBLOKIR:
    'Browser memblokir kamera di alamat ini. Buka aplikasi lewat localhost atau HTTPS, atau pakai kode manual.',
});

export const SEED_BOOKS = Object.freeze([
  {
    kode: 'BK-001',
    judul: 'Matematika untuk SMK Kelas X',
    penulis: 'Tim Matematika SMK',
    kategori: 'Matematika',
    lokasiRak: 'Rak A-1',
    stokTotal: 3,
  },
  {
    kode: 'BK-002',
    judul: 'Bahasa Indonesia untuk SMK Kelas X',
    penulis: 'Tim Bahasa Indonesia',
    kategori: 'Bahasa',
    lokasiRak: 'Rak A-2',
    stokTotal: 2,
  },
  {
    kode: 'BK-003',
    judul: 'Dasar-Dasar Pemrograman',
    penulis: 'Rizal Hidayat',
    kategori: 'Produktif',
    lokasiRak: 'Rak B-1',
    stokTotal: 2,
  },
  {
    kode: 'BK-004',
    judul: 'Basis Data',
    penulis: 'Nurul Aini',
    kategori: 'Produktif',
    lokasiRak: 'Rak B-2',
    stokTotal: 1,
  },
  {
    kode: 'BK-005',
    judul: 'IPAS untuk SMK Kelas X',
    penulis: 'Tim IPAS SMK',
    kategori: 'IPA',
    lokasiRak: 'Rak C-1',
    stokTotal: 2,
  },
  {
    kode: 'BK-006',
    judul: 'Sejarah Indonesia',
    penulis: 'Bambang Suryo',
    kategori: 'IPS',
    lokasiRak: 'Rak C-2',
    stokTotal: 1,
  },
]);