import { LOAN_HOLD_MINUTES, LOAN_HOLD_MS, STATUS } from '../config.js';
import { findBook } from '../books.js';
import { loansFor, loanPayload, quotaFor, returnLoan } from '../loans.js';
import {
  alertBox,
  button,
  copy,
  dataList,
  dataPair,
  el,
  emptyState,
  field,
  formatClock,
  formatCountdown,
  formatDateTime,
  kodePengajuanPanel,
  notice,
  openModal,
  pageHead,
  segmented,
  shell,
  showFieldErrors,
  statusBadge,
  toast,
} from './components.js';

const durasi = (ms) => {
  const total = Math.max(0, Math.round(Number(ms) / 60_000));
  if (total < 60) return `${total} menit`;
  const jam = Math.floor(total / 60);
  const sisa = total % 60;
  return sisa ? `${jam} jam ${sisa} menit` : `${jam} jam`;
};

const countdown = (until, className = 'text-[13px]') =>
  el('span', { class: `tnum ${className}`, dataset: { until: String(until) } }, formatCountdown(until - Date.now()));

const drainBar = (until, total, tone = 'bg-tunggu-dot') => {
  const sisa = Math.max(0, Number(until) - Date.now());
  const rasio = total > 0 ? Math.max(0, Math.min(1, sisa / total)) : 0;

  const fill = el('span', { class: `drain block h-full rounded-full ${tone}` });
  fill.style.width = `${Math.round(rasio * 100)}%`;
  fill.style.animationDuration = `${sisa}ms`;

  return el('span', { class: 'mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-line' }, fill);
};

const kodeLine = (loan) => {
  const book = findBook(loan.bookKode);
  return [loan.bookKode, book?.lokasiRak, book?.kategori].filter(Boolean).join(' · ');
};

const rincian = (loan) =>
  [`Pengajuan ${loan.id}`, `${loan.bookJudul} (${loan.bookKode})`, `Ambil sebelum ${formatClock(loan.batasAmbil)}`, `${loan.namaSiswa} · ${loan.kelas}`].join('\n');

export function render({ session, query, refresh, patchQuery }) {
  const tab = query.get('tab') === 'riwayat' ? 'riwayat' : 'aktif';
  const list = el('div', { class: 'flex flex-col gap-3' });
  const head = el('div');

  const paint = () => {
    const { aktif, riwayat } = loansFor(session.nama, session.kelas);
    const kuota = quotaFor(session.nama, session.kelas);
    const rows = tab === 'aktif' ? aktif : riwayat;

    head.replaceChildren(
      pageHead({
        eyebrow: 'Pinjaman saya',
        title: 'Pantau pengajuan dan peminjamanmu.',
        description:
          tab === 'aktif'
            ? `Ambil buku sebelum batas waktu berakhir, lalu tunjukkan kode pengajuan ke petugas.`
            : 'Riwayat pengembalian dan pengajuan yang sudah lewat batas waktu.',
        meta: el(
          'div',
          { class: 'mt-5 flex flex-wrap items-center gap-2' },
          el(
            'span',
            { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft' },
            el('span', { class: 'tnum font-semibold text-ink' }, String(kuota.used)),
            `dari ${kuota.max} pinjaman aktif`,
          ),
          el(
            'span',
            { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft' },
            el('span', { class: 'tnum font-semibold text-ink' }, String(aktif.length)),
            'sedang berjalan',
          ),
        ),
        actions: [
          segmented({
            items: [
              { id: 'aktif', label: 'Aktif', note: aktif.length },
              { id: 'riwayat', label: 'Riwayat', note: riwayat.length },
            ],
            value: tab,
            onChange: (id) => {
              patchQuery({ tab: id === 'aktif' ? null : id });
              refresh();
            },
          }),
        ],
      }),
    );

    if (rows.length === 0) {
      list.replaceChildren(
        emptyState({
          title: tab === 'aktif' ? 'Belum ada pinjaman aktif' : 'Riwayat masih kosong',
          description:
            tab === 'aktif'
              ? 'Cari buku di katalog, lalu ajukan peminjaman. Buku ditahan satu jam sampai kamu ambil.'
              : 'Transaksi yang sudah selesai atau lewat batas waktu akan tercatat di sini.',
        }),
      );
      return;
    }

    list.replaceChildren(...rows.map((row) => kartu(row)));
  };

  const kartu = ({ loan, statusKey }) => {
    const dipesan = statusKey === STATUS.DIPESAN;
    const header = el(
      'div',
      { class: 'flex flex-wrap items-center justify-between gap-3' },
      el('div', { class: 'flex items-center gap-3' }, statusBadge(statusKey), el('span', { class: 'tnum text-[12.5px] text-ink-mute' }, loan.id)),
      dipesan ? countdown(loan.batasAmbil, 'text-[13px] font-medium text-ink-soft') : el('span', { class: 'text-[12.5px] text-ink-mute' }, formatDateTime(loan.dipinjamPada ?? loan.diajukanPada)),
    );

    const judul = el(
      'div',
      { class: 'mt-3' },
      el('h2', { class: 'font-display text-[22px] leading-snug' }, loan.bookJudul),
      el('p', { class: 'mt-1 text-[12.5px] text-ink-mute' }, kodeLine(loan)),
    );

    const body = dipesan
      ? el(
          'div',
          {},
          el(
            'div',
            { class: 'mt-4 flex items-end justify-between gap-4' },
            el(
              'div',
              {},
              el('p', { class: 'text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-mute' }, 'Batas ambil'),
              el('p', { class: 'mt-1' }, countdown(loan.batasAmbil, 'font-display text-[30px] leading-none')),
            ),
            el('p', { class: 'text-[12.5px] text-ink-mute' }, `Ambil sebelum ${formatClock(loan.batasAmbil)}`),
          ),
          drainBar(loan.batasAmbil, LOAN_HOLD_MS),
        )
      : el(
          'div',
          { class: 'mt-4' },
          dataList(
            statusKey === STATUS.DIPINJAM
              ? dataPair('Dipinjam sejak', formatDateTime(loan.dipinjamPada))
              : statusKey === STATUS.DIKEMBALIKAN
                ? dataPair('Dipinjam', formatDateTime(loan.dipinjamPada))
                : dataPair('Diajukan', formatDateTime(loan.diajukanPada)),
            statusKey === STATUS.DIKEMBALIKAN
              ? dataPair('Dikembalikan', formatDateTime(loan.dikembalikanPada))
              : statusKey === STATUS.KEDALUWARSA
                ? dataPair('Dibatalkan', formatDateTime(loan.kedaluwarsaPada))
                : dataPair('Diajukan', formatDateTime(loan.diajukanPada)),
          ),
        );

    const actions = el(
      'div',
      { class: 'mt-4 flex flex-wrap items-center gap-2' },
      dipesan
        ? button({ label: 'Tunjukkan QR', variant: 'ink', size: 'sm', onClick: () => bukaQr(loan) })
        : null,
      statusKey === STATUS.DIPINJAM
        ? button({ label: 'Kembalikan buku', variant: 'ink', size: 'sm', onClick: () => bukaModal(loan) })
        : null,
      dipesan
        ? button({
            label: 'Salin detail',
            variant: 'outline',
            size: 'sm',
            onClick: async () => {
              const done = await copy(rincian(loan));
              toast(done ? 'Detail pengajuan disalin.' : 'Gagal menyalin.', { tone: done ? 'sukses' : 'gagal' });
            },
          })
        : null,
    );

    const catatan =
      statusKey === STATUS.DIKEMBALIKAN
        ? `Dipinjam selama ${durasi(Number(loan.dikembalikanPada) - Number(loan.dipinjamPada))}`
        : statusKey === STATUS.KEDALUWARSA
          ? `Batas ambil ${LOAN_HOLD_MINUTES} menit terlewat`
          : statusKey === STATUS.DIPINJAM
            ? 'Isi form pengembalian setelah buku diserahkan kembali ke perpustakaan.'
            : '';

    const footer = catatan ? el('p', { class: 'mt-3 text-[12.5px] text-ink-mute' }, catatan) : null;

    return el(
      'article',
      { class: 'rounded-2xl border border-line bg-surface p-5 shadow-card' },
      header,
      judul,
      body,
      actions,
      footer,
    );
  };

  function bukaQr(loan) {
    const modal = openModal({
      title: 'Kode pengajuan',
      description: `${loan.id} · ${loan.bookKode}`,
      size: 'sm',
      body: kodePengajuanPanel({
        loan,
        qrValue: loanPayload(loan),
        catatan: 'Minta petugas memindai QR di atas. Kode pengajuan di bawah tetap bisa disebutkan kalau kamera bermasalah.',
      }),
      actions: [
        button({
          label: 'Salin kode kirim',
          variant: 'outline',
          onClick: async () => {
            const done = await copy(loanPayload(loan));
            toast(
              done ? 'Kode kirim disalin. Kirim ke petugas kalau kamera tidak bisa dipakai.' : 'Gagal menyalin.',
              { tone: done ? 'sukses' : 'gagal' },
            );
          },
        }),
      ],
    });
  }

  function bukaModal(loan) {
    const bindings = {};
    const errorBox = el('div');

    const namaField = field({ label: 'Nama', name: 'nama', value: loan.namaSiswa, readOnly: true });
    const kelasField = field({ label: 'Kelas', name: 'kelas', value: loan.kelas, readOnly: true });
    const judulField = field({ label: 'Judul buku', name: 'judul', value: loan.bookJudul, readOnly: true });
    const kodeField = field({
      label: 'Kode buku',
      name: 'kodeBuku',
      value: '',
      placeholder: loan.bookKode,
      required: true,
      hint: 'Ketik kode yang tertera di label buku, contoh BK-001.',
    });

    bindings.kodeBuku = kodeField;

    kodeField.control.addEventListener('input', () => {
      const upper = kodeField.value().toUpperCase();
      if (kodeField.value() !== upper) kodeField.setValue(upper);
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
      judulField.wrap,
      kodeField.wrap,
      el('div', { class: 'grid gap-4 sm:grid-cols-2' }, namaField.wrap, kelasField.wrap),
      errorBox,
      notice({
        tone: 'info',
        message: 'Pastikan buku sudah kamu bawa saat mengisi form ini. Stok bertambah setelah pengembalian tercatat.',
      }),
    );

    const modal = openModal({
      title: 'Kembalikan buku',
      description: `${loan.id} · ${loan.bookKode}`,
      body: form,
      actions: [
        button({ label: 'Batal', variant: 'ghost', onClick: () => modal.close() }),
        button({ label: 'Kirim', variant: 'primary', onClick: () => form.requestSubmit() }),
      ],
    });

    function kirim() {
      const result = returnLoan(loan.id, {
        kodeBuku: kodeField.value(),
        namaSiswa: session.nama,
        kelas: session.kelas,
      });

      if (!result.ok) {
        const padaKode = !result.fields && (result.code === 'KODE_TIDAK_COCOK' || result.code === 'VALIDASI');
        const adaField = showFieldErrors(bindings, result);

        if (padaKode && !adaField) kodeField.setError(result.message);
        errorBox.replaceChildren(adaField || padaKode ? '' : alertBox(result.message));
        return;
      }

      modal.close();
      toast(`Buku ${result.data.bookJudul} berhasil dikembalikan.`, { tone: 'sukses' });
      patchQuery({ tab: 'riwayat' });
      refresh();
    }
  }

  paint();

  return shell(head, el('section', { class: 'mt-6' }, list));
}
