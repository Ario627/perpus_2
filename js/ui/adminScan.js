import { LOAN_HOLD_MINUTES, LOAN_HOLD_MS, LOAN_KODE_REGEX, PAYLOAD_PREFIX } from '../config.js';
import { findScanTarget, pendingLoans, readLoanPayload, verifyAndBorrow } from '../loans.js';
import { createScanner } from '../scanner.js';
import {
  button,
  el,
  emptyState,
  field,
  formatClock,
  formatCountdown,
  formatDateTime,
  notice,
  pageHead,
  shell,
  toast,
} from './components.js';

const lower = (value) => String(value ?? '').toLocaleLowerCase('id-ID');
const kodeOf = (value) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

const STATUS_TEXT = {
  idle: 'Kamera belum aktif.',
  starting: 'Menyiapkan kamera…',
  running: 'Arahkan ke QR pengajuan siswa atau label buku.',
  error: 'Kamera bermasalah. Pakai input kode manual.',
};

const HINTS = {
  QR_TIDAK_DIKENALI: 'Kode harus BK-000 (label buku), PJ-0000, atau kode kiriman dari layar siswa.',
  BUKU_TIDAK_ADA: 'Kode buku ini tidak ada di katalog perangkat ini.',
  TIDAK_ADA_PENGAJUAN:
    'Kalau siswa mengajukan dari HP, pengajuannya tersimpan di HP itu — minta dia memindai atau menyalin kode kiriman dari layar pengajuan.',
  KEDALUWARSA: 'Minta siswa mengajukan ulang lalu pindai kode yang baru.',
  STATUS_TIDAK_VALID: 'Pengajuan ini mungkin sudah diserahkan sebelumnya.',
};

const ringkas = (value) => {
  const teks = String(value ?? '').trim();
  return teks.length > 28 ? `${teks.slice(0, 14)}…${teks.slice(-6)}` : teks;
};

const sumberLabel = (terbaca) => {
  if (terbaca.startsWith(PAYLOAD_PREFIX)) return 'kode kiriman siswa';
  if (LOAN_KODE_REGEX.test(terbaca)) return `kode pengajuan ${terbaca}`;
  return `label buku ${terbaca}`;
};

const sisaWaktu = (until) => el('span', { class: 'tnum text-[13px]', dataset: { until: String(until) } }, formatCountdown(Number(until) - Date.now()));

const drainBar = (until, total) => {
  const sisa = Math.max(0, Number(until) - Date.now());
  const rasio = total > 0 ? Math.max(0, Math.min(1, sisa / total)) : 0;

  const fill = el('span', { class: 'drain block h-full rounded-full bg-tunggu-dot' });
  fill.style.width = `${Math.round(rasio * 100)}%`;
  fill.style.animationDuration = `${sisa}ms`;

  return el('span', { class: 'mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-line' }, fill);
};

export function render({ onCleanup, onExternalChange }) {
  const reader = el('div', { id: 'reader', class: 'aspect-square w-full' });
  const overlay = el(
    'div',
    { class: 'pointer-events-none absolute inset-0 grid place-items-center px-8 text-center' },
    el(
      'p',
      { class: 'max-w-[16rem] text-[13px] leading-relaxed text-ink-soft' },
      'Tekan mulai scan, lalu arahkan ke QR pengajuan siswa atau QR pada label buku.',
    ),
  );

  const status = el('p', { class: 'mt-2 text-[12.5px] text-ink-mute', 'aria-live': 'polite' }, STATUS_TEXT.idle);
  const hasil = el('div', { class: 'mt-4' });
  const pendingList = el('ul', { class: 'mt-4 flex flex-col gap-2.5' });
  const pendingCount = el('span', { class: 'tnum text-[12.5px] text-ink-mute' }, '0 pengajuan');
  const pencarian = { q: '' };

  const kodeManual = field({
    label: 'Kode buku, kode pengajuan, atau kode kiriman',
    name: 'kode',
    placeholder: 'BK-001 / PJ-0001 / PD1-…',
    hint: 'Kode kiriman dari layar HP siswa bisa ditempel di sini kalau kamera tidak dipakai.',
  });
  kodeManual.control.addEventListener('input', () => {
    const upper = kodeManual.value().toUpperCase();
    if (kodeManual.value() !== upper) kodeManual.setValue(upper);
  });

  const cariPending = field({ name: 'cari', type: 'search', placeholder: 'Cari nama, kelas, atau judul' });
  cariPending.control.setAttribute('aria-label', 'Cari pengajuan aktif');

  const toggle = button({ label: 'Mulai scan', variant: 'ink', onClick: () => toggleScan() });
  const senter = button({ label: 'Senter', variant: 'outline', size: 'sm', onClick: () => nyalakanSenter() });
  senter.hidden = true;

  const scanner = createScanner({
    elementId: 'reader',
    onCode: (code) => prosesKode(code),
    onState: (phase) => {
      status.textContent = STATUS_TEXT[phase] ?? STATUS_TEXT.idle;
      overlay.hidden = phase === 'running' || phase === 'starting';
      toggle.textContent = phase === 'running' || phase === 'starting' ? 'Hentikan scan' : 'Mulai scan';
      senter.hidden = !scanner.torchReady();
    },
  });

  onCleanup(() => {
    void scanner.stop();
  });

  onExternalChange(() => paintPending());

  const setHasil = (node) => hasil.replaceChildren(...(node ? [node] : []));

  const tampilNetral = () =>
    setHasil(
      notice({
        tone: 'info',
        message: 'Hasil pemindaian muncul di sini. Satu QR hanya berlaku untuk satu pengajuan aktif.',
      }),
    );

  const tampilGagal = (kode, result) =>
    setHasil(
      el(
        'div',
        { class: 'flex flex-col gap-2' },
        notice({ tone: 'danger', title: result.message, message: HINTS[result.code] ?? '' }),
        el('p', { class: 'tnum text-[12px] text-ink-mute' }, `Kode terbaca: ${ringkas(kode)}`),
      ),
    );

  const tampilSukses = (kode, loan) =>
    setHasil(
      el(
        'div',
        { class: 'flex flex-col gap-2' },
        notice({
          tone: 'tuntas',
          title: loan.bookJudul,
          message: `Diserahkan ke ${loan.namaSiswa} (${loan.kelas}) · ${formatDateTime(loan.dipinjamPada)} · ${loan.id}`,
        }),
        el('p', { class: 'text-[12px] text-ink-mute' }, `Sumber: ${sumberLabel(kode)}`),
      ),
    );

  const pilihSiswa = (kode, candidates) =>
    new Promise((resolve) => {
      const selesai = (value) => {
        if (selesai.done) return;
        selesai.done = true;
        resolve(value);
      };

      setHasil(
        el(
          'div',
          { class: 'flex flex-col gap-3' },
          notice({
            tone: 'tunggu',
            title: `${candidates.length} pengajuan untuk ${kode}`,
            message: 'Pilih nama siswa yang menyerahkan buku saat ini.',
          }),
          el(
            'ul',
            { class: 'flex flex-col gap-2' },
            ...candidates.map((loan) =>
              el(
                'li',
                { class: 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3' },
                el(
                  'div',
                  { class: 'min-w-0' },
                  el('p', { class: 'text-[14px] font-medium' }, loan.namaSiswa),
                  el('p', { class: 'tnum text-[12.5px] text-ink-mute' }, `${loan.kelas} · ${loan.id}`),
                ),
                el(
                  'div',
                  { class: 'flex items-center gap-3' },
                  el('span', { class: 'text-[12px] text-ink-mute' }, `batas ${formatClock(loan.batasAmbil)}`),
                  button({ label: 'Pilih', variant: 'ink', size: 'sm', onClick: () => selesai(loan) }),
                ),
              ),
            ),
          ),
          button({ label: 'Batal', variant: 'ghost', size: 'sm', onClick: () => selesai(null) }),
        ),
      );
    });

  async function serahkan(loan, terbaca = loan.bookKode) {
    const result = verifyAndBorrow(loan.id, loan.bookKode);

    if (!result.ok) {
      tampilGagal(terbaca, result);
      toast(result.message, { tone: 'gagal' });
      paintPending();
      return;
    }

    tampilSukses(terbaca, result.data);
    toast(`${result.data.bookJudul} diserahkan ke ${result.data.namaSiswa}.`, { tone: 'sukses' });
    kodeManual.setValue('');
    paintPending();
  }

  async function prosesKode(raw) {
    const kode = kodeOf(raw);
    if (!kode) return;

    const target = findScanTarget(kode);

    if (!target.ok) {
      tampilGagal(kode, target);
      toast(target.message, { tone: 'gagal' });
      paintPending();
      return;
    }

    const { kandidat, diimpor } = target.data;

    if (diimpor) {
      toast(`Pengajuan dari perangkat lain diterima: ${kandidat[0].bookJudul}.`, { tone: 'info' });
    }

    if (kandidat.length === 1) {
      await serahkan(kandidat[0], kode);
      return;
    }

    const dipilih = await pilihSiswa(kode, kandidat);
    if (!dipilih) {
      tampilNetral();
      return;
    }

    await serahkan(dipilih, kode);
  }

  async function toggleScan() {
    if (scanner.running() || scanner.phase() === 'starting') {
      await scanner.stop();
      return;
    }

    const result = await scanner.start();
    if (!result.ok) toast(result.message, { tone: 'gagal' });
  }

  async function nyalakanSenter() {
    const aktif = senter.dataset.aktif !== '1';
    const result = await scanner.setTorch(aktif);

    if (!result.ok) {
      senter.hidden = true;
      toast(result.message, { tone: 'gagal' });
      return;
    }

    senter.dataset.aktif = aktif ? '1' : '0';
    senter.textContent = aktif ? 'Matikan senter' : 'Senter';
  }

  function paintPending() {
    const terms = lower(pencarian.q).split(' ').filter(Boolean);
    const semua = pendingLoans();
    const rows = semua.filter((row) => {
      if (terms.length === 0) return true;
      const jejak = lower([row.loan.namaSiswa, row.loan.kelas, row.loan.bookJudul, row.loan.bookKode, row.loan.id].join(' '));
      return terms.every((term) => jejak.includes(term));
    });

    pendingCount.textContent = semua.length === 0 ? 'Tidak ada pengajuan' : `${semua.length} pengajuan menunggu`;

    pendingList.replaceChildren(
      ...(rows.length
        ? rows.map((row) =>
            el(
              'li',
              { class: 'rounded-2xl border border-line bg-paper/60 p-4' },
              el(
                'div',
                { class: 'flex items-start justify-between gap-3' },
                el(
                  'div',
                  { class: 'min-w-0' },
                  el('p', { class: 'font-display text-[18px] leading-snug' }, row.loan.bookJudul),
                  el('p', { class: 'tnum mt-1 text-[12.5px] text-ink-mute' }, `${row.loan.bookKode}${row.book ? ` · ${row.book.lokasiRak}` : ''}`),
                  el('p', { class: 'mt-1 text-[12.5px] text-ink-soft' }, `${row.loan.namaSiswa} · ${row.loan.kelas}`),
                ),
                el('div', { class: 'flex shrink-0 flex-col items-end gap-1.5' }, sisaWaktu(row.loan.batasAmbil), el('span', { class: 'tnum text-[11.5px] text-ink-mute' }, row.loan.id)),
              ),
              drainBar(row.loan.batasAmbil, LOAN_HOLD_MS),
              el(
                'div',
                { class: 'mt-3 flex items-center justify-between gap-3' },
                el('p', { class: 'text-[12.5px] text-ink-mute' }, `Batas ${formatClock(row.loan.batasAmbil)}`),
                button({ label: 'Serahkan', variant: 'outline', size: 'sm', onClick: () => serahkan(row.loan) }),
              ),
            ),
          )
        : [
            el(
              'li',
              {},
              emptyState({
                title: pencarian.q ? 'Tidak ada yang cocok' : 'Belum ada pengajuan',
                description: pencarian.q
                  ? 'Coba kata kunci lain.'
                  : 'Pengajuan baru dari siswa akan muncul di sini secara otomatis.',
              }),
            ),
          ]),
    );
  }

  kodeManual.control.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void prosesKode(kodeManual.value());
  });

  cariPending.control.addEventListener('input', () => {
    pencarian.q = cariPending.value();
    paintPending();
  });

  tampilNetral();
  paintPending();

  const panelKamera = el(
    'section',
    { class: 'flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6' },
    el(
      'header',
      { class: 'flex flex-wrap items-start justify-between gap-3' },
      el(
        'div',
        {},
        el('h2', { class: 'font-display text-[22px] leading-tight' }, 'Pemindai QR'),
        status,
      ),
      el('div', { class: 'flex items-center gap-2' }, senter, toggle),
    ),
    el('div', { class: 'relative mt-4 overflow-hidden rounded-2xl border border-line bg-paper' }, reader, overlay),
    el(
      'div',
      { class: 'mt-5 border-t border-line pt-5' },
      el(
        'div',
        { class: 'flex flex-col gap-3 sm:flex-row sm:items-end' },
        el('div', { class: 'w-full' }, kodeManual.wrap),
        button({ label: 'Proses', variant: 'primary', onClick: () => void prosesKode(kodeManual.value()) }),
      ),
    ),
    hasil,
  );

  const panelPengajuan = el(
    'section',
    { class: 'flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6' },
    el(
      'header',
      { class: 'flex flex-wrap items-start justify-between gap-3' },
      el(
        'div',
        {},
        el('h2', { class: 'font-display text-[22px] leading-tight' }, 'Pengajuan aktif'),
        el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, 'Daftar ini diperbarui otomatis dari tab siswa.'),
      ),
      pendingCount,
    ),
    el('div', { class: 'mt-4' }, cariPending.wrap),
    el('div', { class: 'mt-2 flex-1' }, pendingList),
  );

  return shell(
    pageHead({
      eyebrow: 'Pengajuan & scan',
      title: 'Cocokkan buku dengan pengajuan.',
      description:
        'Pindai QR pengajuan di layar siswa — termasuk dari HP yang berbeda — atau pindai QR pada label buku lalu pilih nama yang hadir.',
      meta: el(
        'div',
        { class: 'mt-5 flex flex-wrap items-center gap-2' },
        el(
          'span',
          { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft' },
          el('span', { class: 'tnum font-semibold text-ink' }, 'PJ-0000'),
          'layar pengajuan siswa',
        ),
        el(
          'span',
          { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft' },
          el('span', { class: 'tnum font-semibold text-ink' }, 'BK-000'),
          'label pada buku',
        ),
      ),
    }),
    el('div', { class: 'mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]' }, panelKamera, panelPengajuan),
  );
}
