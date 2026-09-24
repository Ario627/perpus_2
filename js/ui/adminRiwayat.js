import { STATUS, STATUS_UI } from '../config.js';
import { listLoans, returnLoan } from '../loans.js';
import {
  button,
  chip,
  el,
  emptyState,
  field,
  formatDate,
  formatDateTime,
  notice,
  openModal,
  pageHead,
  shell,
  showFieldErrors,
  stat,
  statusBadge,
  toast,
} from './components.js';

const FILTERS = [
  { value: '', label: 'Semua' },
  { value: STATUS.DIPESAN, label: 'Dipesan' },
  { value: STATUS.DIPINJAM, label: 'Sedang meminjam' },
  { value: STATUS.DIKEMBALIKAN, label: 'Selesai' },
  { value: STATUS.KEDALUWARSA, label: 'Dibatalkan' },
];

const CSV_HEAD = ['ID', 'Nama', 'Kelas', 'Judul', 'Kode', 'Status', 'Diajukan', 'Dipinjam', 'Dikembalikan'];
const pad = (value) => String(value).padStart(2, '0');

const sheetStamp = (value) => {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return '';

  const date = new Date(time);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const jejakWaktu = (loan, statusKey) => {
  if (statusKey === STATUS.DIPESAN) return `Diajukan ${formatDateTime(loan.diajukanPada)}`;
  if (statusKey === STATUS.DIPINJAM) return `Dipinjam ${formatDateTime(loan.dipinjamPada)}`;
  if (statusKey === STATUS.DIKEMBALIKAN) return `Kembali ${formatDateTime(loan.dikembalikanPada)}`;
  return `Batal ${formatDateTime(loan.kedaluwarsaPada)}`;
};

export function render() {
  const filter = { status: '', q: '', urut: 'baru' };

  const stats = el('div', { class: 'grid grid-cols-2 gap-3 sm:grid-cols-4' });
  const chips = el('div', { class: 'flex items-center gap-2 overflow-x-auto no-scrollbar' });
  const hitung = el('p', { class: 'text-[13px] text-ink-mute', 'aria-live': 'polite' });
  const list = el('ul', { class: 'mt-3 flex flex-col gap-3' });

  const search = field({ name: 'cari', type: 'search', placeholder: 'Cari nama, kelas, judul, atau kode' });
  search.control.setAttribute('aria-label', 'Cari riwayat');

  const rows = () => {
    const data = listLoans({ status: filter.status, q: filter.q });
    return filter.urut === 'lama' ? data.slice().reverse() : data;
  };

  const baris = ({ loan, statusKey }) =>
    el(
      'li',
      { class: 'grid gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-card md:grid-cols-[7rem_minmax(0,1fr)_9.5rem_11rem_auto] md:items-center md:gap-5' },
      el(
        'div',
        { class: 'flex items-center justify-between gap-3 md:block' },
        el('p', { class: 'tnum text-[13px] font-semibold text-ink-soft' }, loan.id),
        el('p', { class: 'text-[12px] text-ink-mute md:mt-1' }, formatDate(loan.diajukanPada)),
      ),
      el(
        'div',
        { class: 'min-w-0' },
        el('p', { class: 'font-display text-[18px] leading-snug' }, loan.bookJudul),
        el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, `${loan.namaSiswa} · ${loan.kelas} · ${loan.bookKode}`),
      ),
      el(
        'div',
        { class: 'flex items-center justify-between gap-3 md:block' },
        statusBadge(statusKey),
        el('p', { class: 'text-[12.5px] text-ink-mute md:hidden' }, jejakWaktu(loan, statusKey)),
      ),
      el('p', { class: 'hidden text-[12.5px] text-ink-mute md:block md:text-right' }, jejakWaktu(loan, statusKey)),
      statusKey === STATUS.DIPINJAM
        ? el(
            'div',
            { class: 'md:text-right' },
            button({ label: 'Terima kembali', variant: 'outline', size: 'sm', onClick: () => bukaKembali(loan) }),
          )
        : null,
    );

  function bukaKembali(loan) {
    const bindings = {};
    const errorBox = el('div');

    const kodeField = field({
      label: 'Kode buku',
      name: 'kodeBuku',
      placeholder: loan.bookKode,
      required: true,
      hint: 'Ketik kode pada label buku untuk memastikan buku fisik yang diterima memang benar.',
    });

    bindings.kodeBuku = kodeField;

    kodeField.control.addEventListener('input', () => {
      const besar = kodeField.value().toUpperCase();
      if (kodeField.value() !== besar) kodeField.setValue(besar);
    });

    const form = el(
      'form',
      {
        class: 'flex flex-col gap-4',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          kirim();
        },
      },
      el(
        'div',
        { class: 'rounded-2xl border border-line bg-paper px-4 py-3' },
        el('p', { class: 'font-display text-[19px] leading-snug' }, loan.bookJudul),
        el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, `${loan.id} · ${loan.namaSiswa} · ${loan.kelas}`),
      ),
      kodeField.wrap,
      errorBox,
      notice({
        tone: 'info',
        message: 'Stok bertambah satu begitu pengembalian tercatat. Pastikan buku sudah diterima petugas.',
      }),
    );

    const modal = openModal({
      title: 'Terima pengembalian',
      description: `Dipinjam sejak ${formatDateTime(loan.dipinjamPada)}`,
      size: 'sm',
      body: form,
      actions: [
        button({ label: 'Batal', variant: 'ghost', onClick: () => modal.close() }),
        button({ label: 'Catat kembali', variant: 'primary', onClick: () => kirim() }),
      ],
    });

    function kirim() {
      const result = returnLoan(loan.id, {
        kodeBuku: kodeField.value(),
        namaSiswa: loan.namaSiswa,
        kelas: loan.kelas,
        olehPetugas: true,
      });

      if (!result.ok) {
        const adaField = showFieldErrors(bindings, result);
        if (!adaField) kodeField.setError(result.message);
        errorBox.replaceChildren();
        return;
      }

      modal.close();
      toast(`${result.data.bookJudul} diterima kembali dari ${result.data.namaSiswa}.`, { tone: 'sukses' });
      paint();
    }
  }

  function paint() {
    const semua = listLoans({});
    const data = rows();
    const hitungStatus = (key) => semua.filter((row) => row.statusKey === key).length;

    stats.replaceChildren(
      stat({ label: 'Total transaksi', value: String(semua.length), note: 'tercatat di perangkat ini' }),
      stat({ label: 'Sedang berjalan', value: String(hitungStatus(STATUS.DIPESAN) + hitungStatus(STATUS.DIPINJAM)), note: 'dipesan dan dipinjam' }),
      stat({ label: 'Selesai', value: String(hitungStatus(STATUS.DIKEMBALIKAN)), note: 'dikembalikan siswa' }),
      stat({ label: 'Dibatalkan', value: String(hitungStatus(STATUS.KEDALUWARSA)), note: 'lewat batas ambil' }),
    );

    chips.replaceChildren(
      ...FILTERS.map((item) =>
        chip({
          label: item.label,
          active: filter.status === item.value,
          count: item.value ? hitungStatus(item.value) : semua.length,
          onClick: () => {
            filter.status = item.value;
            paint();
          },
        }),
      ),
      el('span', { class: 'mx-1 h-6 w-px shrink-0 bg-line' }),
      chip({
        label: filter.urut === 'baru' ? 'Terbaru dulu' : 'Terlama dulu',
        active: filter.urut === 'lama',
        onClick: () => {
          filter.urut = filter.urut === 'baru' ? 'lama' : 'baru';
          paint();
        },
      }),
    );

    hitung.textContent = data.length ? `Menampilkan ${data.length} dari ${semua.length} transaksi` : 'Tidak ada transaksi yang cocok';

    list.replaceChildren(
      ...(data.length
        ? data.map(baris)
        : [
            el(
              'li',
              {},
              emptyState({
                title: 'Belum ada transaksi',
                description: 'Setiap pengajuan, peminjaman, dan pengembalian akan tercatat di halaman ini.',
              }),
            ),
          ]),
    );
  }

  function eksporCsv() {
    const data = rows();
    if (data.length === 0) {
      toast('Tidak ada data untuk diekspor.', { tone: 'gagal' });
      return;
    }

    const lines = [
      CSV_HEAD,
      ...data.map(({ loan, statusKey }) => [
        loan.id,
        loan.namaSiswa,
        loan.kelas,
        loan.bookJudul,
        loan.bookKode,
        STATUS_UI[statusKey]?.label ?? statusKey,
        sheetStamp(loan.diajukanPada),
        sheetStamp(loan.dipinjamPada),
        sheetStamp(loan.dikembalikanPada),
      ]),
    ];

    const text = lines.map((line) => line.map(quote).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date();
    const link = el('a', {
      href: url,
      download: `riwayat-pustaka-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.csv`,
    });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
    toast(`${data.length} baris diekspor ke CSV.`, { tone: 'sukses' });
  }

  search.control.addEventListener('input', () => {
    filter.q = search.value();
    paint();
  });

  search.control.addEventListener('search', () => {
    filter.q = search.value();
    paint();
  });

  paint();

  return shell(
    pageHead({
      eyebrow: 'Riwayat',
      title: 'Semua transaksi sirkulasi.',
      description: 'Pantau pengajuan yang lewat batas waktu, peminjaman berjalan, dan pengembalian yang sudah tercatat.',
      actions: [button({ label: 'Ekspor CSV', variant: 'outline', onClick: eksporCsv })],
    }),
    el('section', { class: 'mt-8' }, stats),
    el(
      'section',
      { class: 'mt-8' },
      el('div', { class: 'w-full sm:max-w-sm' }, search.wrap),
      el('div', { class: 'mt-4' }, chips),
      el(
        'div',
        { class: 'mt-6' },
        el(
          'div',
          { class: 'hidden gap-5 px-4 pb-2 md:grid md:grid-cols-[7rem_minmax(0,1fr)_9.5rem_11rem_auto] md:items-center' },
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'ID'),
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Buku & peminjam'),
          el('span', { class: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Status'),
          el('span', { class: 'text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute' }, 'Waktu'),
          el('span', {}),
        ),
        hitung,
        list,
      ),
    ),
  );
}
