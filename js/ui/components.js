import { BOOK_STATUS, RECEIPT_PARAM, STATUS_UI, TOAST_MS } from '../config.js';
import { renderQr } from '../qr.js';

let seq = 0;
const nextId = (prefix) => `${prefix}-${(seq += 1).toString(36)}`;

const flatten = (children, out = []) => {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true || child === '') continue;
    if (Array.isArray(child)) flatten(child, out);
    else out.push(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return out;
};

const bind = (node, props) => {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (/^on[A-Z]/.test(key)) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key === 'class') {
      node.className = value;
      continue;
    }
    if (key === 'text') {
      node.textContent = value;
      continue;
    }
    if (key === 'dataset') {
      Object.assign(node.dataset, value);
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }
    if (key in node) {
      node[key] = value;
      continue;
    }
    node.setAttribute(key, value === true ? '' : String(value));
  }
};

export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  bind(node, props);
  node.append(...flatten(children));
  return node;
};

export const shell = (...children) =>
  el(
    'div',
    { class: 'mx-auto w-full max-w-shell px-5 pb-28 pt-8 sm:px-8 sm:pb-20 sm:pt-12' },
    ...children,
  );

export const pageHead = ({ eyebrow = '', title = '', description = '', meta = null, actions = [] } = {}) =>
  el(
    'header',
    { class: 'flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between' },
    el(
      'div',
      { class: 'max-w-2xl' },
      eyebrow ? el('p', { class: 'text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-mute' }, eyebrow) : null,
      el('h1', { class: 'mt-2.5 font-display text-[2rem] leading-[1.08] tracking-[-0.015em] sm:text-[2.6rem]' }, title),
      description ? el('p', { class: 'mt-3 text-[14.5px] leading-relaxed text-ink-soft' }, description) : null,
      meta,
    ),
    actions.length > 0 ? el('div', { class: 'flex flex-wrap items-center gap-2' }, ...actions) : null,
  );

const TONE = {
  tunggu: { chip: 'border-tunggu-line bg-tunggu-bg text-tunggu-fg', dot: 'bg-tunggu-dot' },
  jalan: { chip: 'border-jalan-line bg-jalan-bg text-jalan-fg', dot: 'bg-jalan-dot' },
  tuntas: { chip: 'border-tuntas-line bg-tuntas-bg text-tuntas-fg', dot: 'bg-tuntas-dot' },
  lewat: { chip: 'border-lewat-line bg-lewat-bg text-lewat-fg', dot: 'bg-lewat-dot' },
};

export const badge = (label, tone = 'lewat', { dot = true } = {}) => {
  const skin = TONE[tone] ?? TONE.lewat;
  return el(
    'span',
    { class: `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium ${skin.chip}` },
    dot ? el('span', { class: `h-1.5 w-1.5 shrink-0 rounded-full ${skin.dot}` }) : null,
    label,
  );
};

export const statusBadge = (statusKey) => {
  const ui = STATUS_UI[statusKey];
  return ui ? badge(ui.label, ui.tone) : null;
};

export const bookBadge = (statusKey) => {
  const ui = BOOK_STATUS[statusKey];
  return ui ? badge(ui.label, ui.tone) : null;
};

const VARIANTS = {
  primary: 'bg-accent text-paper hover:bg-accent-deep',
  ink: 'bg-ink text-paper hover:bg-accent',
  outline: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-paper',
  ghost: 'text-ink-soft hover:bg-paper hover:text-ink',
  danger: 'border border-[#e8c9c0] bg-[#fdf5f2] text-[#8f3323] hover:bg-[#fbeae5]',
  quiet: 'text-ink-mute hover:text-ink',
};

const SIZES = {
  sm: 'h-9 gap-1.5 px-3.5 text-[13px]',
  md: 'h-10 gap-2 px-4 text-[13.5px]',
  lg: 'h-11 gap-2 px-5 text-sm',
};

export const button = ({ label, variant = 'primary', size = 'md', type = 'button', disabled = false, onClick = null, title = '' } = {}) =>
  el(
    'button',
    {
      type,
      title: title || null,
      disabled,
      onClick,
      class: `inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition duration-200 disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size] ?? SIZES.md}`,
    },
    label,
  );

export const chip = ({ label, active = false, count = null, onClick = null, title = '' } = {}) =>
  el(
    'button',
    {
      type: 'button',
      title: title || null,
      onClick,
      'aria-pressed': String(active),
      class: `inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] transition duration-200 ${
        active ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
      }`,
    },
    label,
    count === null ? null : el('span', { class: `tnum ${active ? 'text-paper/65' : 'text-ink-mute'}` }, count),
  );

export const segmented = ({ items = [], value = null, onChange = null } = {}) => {
  let current = value ?? items[0]?.id;
  const buttons = new Map();

  const paint = () => {
    for (const [id, node] of buttons) {
      const active = id === current;
      node.className = `inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition duration-200 ${
        active ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
      }`;
      node.setAttribute('aria-pressed', String(active));
      const note = node.querySelector('[data-note]');
      if (note) note.className = `tnum text-[12px] ${active ? 'text-paper/70' : 'text-ink-mute'}`;
    }
  };

  const node = el(
    'div',
    { class: 'inline-flex rounded-full border border-line bg-surface p-1' },
    ...items.map((item) => {
      const control = el(
        'button',
        {
          type: 'button',
          class: 'inline-flex h-8 items-center rounded-full px-3.5 text-[13px]',
          onClick: () => {
            if (item.id === current) return;
            current = item.id;
            paint();
            onChange?.(item.id);
          },
        },
        item.label,
        item.note === undefined || item.note === null
          ? null
          : el('span', { dataset: { note: '' }, class: 'tnum text-[12px]' }, item.note),
      );
      buttons.set(item.id, control);
      return control;
    }),
  );

  paint();
  return node;
};

export const stat = ({ label, value, note = '' } = {}) =>
  el(
    'div',
    { class: 'rounded-2xl border border-line bg-surface p-4 shadow-card' },
    el('p', { class: 'text-[12px] text-ink-mute' }, label),
    el('p', { class: 'mt-1.5 font-display text-[26px] leading-none tnum' }, value),
    note ? el('p', { class: 'mt-2 text-[12px] text-ink-mute' }, note) : null,
  );

export const emptyState = ({ title, description = '', action = null } = {}) =>
  el(
    'div',
    { class: 'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center' },
    el('p', { class: 'font-display text-[26px] leading-tight' }, title),
    description ? el('p', { class: 'max-w-sm text-[13.5px] leading-relaxed text-ink-soft' }, description) : null,
    action,
  );

const NOTICE = {
  info: 'border-line bg-surface text-ink-soft',
  tunggu: 'border-tunggu-line bg-tunggu-bg text-tunggu-fg',
  tuntas: 'border-tuntas-line bg-tuntas-bg text-tuntas-fg',
  danger: 'border-[#e8c9c0] bg-[#fdf5f2] text-[#8f3323]',
};

export const notice = ({ tone = 'info', title = '', message = '', action = null } = {}) =>
  el(
    'div',
    { class: `flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${NOTICE[tone] ?? NOTICE.info}` },
    el(
      'div',
      { class: 'min-w-0 flex-1' },
      title ? el('p', { class: 'font-medium' }, title) : null,
      message ? el('p', { class: title ? 'mt-0.5 opacity-90' : '' }, message) : null,
    ),
    action,
  );

export const alertBox = (message, tone = 'danger') => (message ? notice({ tone, message }) : null);

export const stockBar = (tersedia, total) => {
  const ratio = total > 0 ? Math.max(0, Math.min(1, tersedia / total)) : 0;
  const tint = ratio === 0 ? 'bg-lewat-dot' : ratio < 0.34 ? 'bg-tunggu-dot' : 'bg-tuntas-dot';
  const fill = el('span', { class: `block h-full rounded-full ${tint}` });
  fill.style.width = `${Math.round(ratio * 100)}%`;
  return el('span', { class: 'block h-1.5 w-full overflow-hidden rounded-full bg-line' }, fill);
};

export const dataPair = (label, value) =>
  el(
    'div',
    { class: 'flex items-baseline justify-between gap-4 py-2.5' },
    el('span', { class: 'shrink-0 text-[13px] text-ink-mute' }, label),
    el('span', { class: 'min-w-0 text-right text-[13.5px] font-medium' }, value),
  );

export const dataList = (...pairs) => el('div', { class: 'divide-y divide-line' }, ...pairs);

const JAM = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const asTime = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

export const formatClock = (value) => {
  const time = asTime(value);
  return time ? JAM.format(time) : '—';
};

export const formatDateTime = (value) => {
  const time = asTime(value);
  return time ? `${TANGGAL.format(time)} · ${JAM.format(time)}` : '—';
};

export const formatDate = (value) => {
  const time = asTime(value);
  return time ? TANGGAL.format(time) : '—';
};

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 60_000));
  if (total >= 60) return `sisa ${Math.floor(total / 60)} jam ${total % 60} menit`;
  if (total >= 1) return `sisa ${total} menit`;
  return 'kurang dari 1 menit';
}

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function copy(value) {
  const text = String(value ?? '');
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    void 0;
  }

  try {
    const area = el('textarea', { readOnly: true, value: text });
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  } catch {
    return false;
  }
}

const TOAST_TONE = {
  sukses: 'border-l-tuntas-dot',
  gagal: 'border-l-[#b4432f]',
  info: 'border-l-ink/40',
};

let toastSlot = null;

const toastHost = () => toastSlot ?? document.getElementById('toast');

export function toast(message, { tone = 'info', duration = TOAST_MS } = {}) {
  const host = toastHost();
  const text = String(message ?? '').trim();
  if (!host || !text) return;

  while (host.children.length >= 4) host.firstElementChild?.remove();

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 200);
  };

  const node = el(
    'button',
    {
      type: 'button',
      onClick: dismiss,
      class: `pointer-events-auto w-full rounded-2xl border border-l-[3px] border-line ${
        TOAST_TONE[tone] ?? TOAST_TONE.info
      } bg-surface/95 px-4 py-3 text-left text-[13.5px] font-medium shadow-card backdrop-blur transition-opacity duration-200 animate-rise`,
    },
    text,
  );

  const timer = setTimeout(dismiss, duration);
  host.append(node);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal({
  title = '',
  description = '',
  size = 'md',
  dismissible = true,
  body = null,
  actions = [],
  onClose = null,
} = {}) {
  const host = document.getElementById('modal');
  if (!host) return null;

  const previous = document.activeElement;
  const teardown = [];
  const closers = onClose ? [onClose] : [];
  const titleId = nextId('judul');
  const previousSlot = toastSlot;
  let closed = false;

  const width = size === 'lg' ? 'sm:max-w-2xl' : size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-xl';
  const heading = el('h2', { id: titleId, class: 'font-display text-[22px] leading-tight' }, title);
  const lede = el('p', { class: 'mt-1 text-[13px] leading-relaxed text-ink-mute', hidden: !description }, description);
  const slot = el('div', {
    class: 'pointer-events-none -mx-5 -mt-5 flex flex-col gap-2 px-5 pt-5 empty:hidden sm:-mx-6 sm:px-6',
  });
  const content = el('div');
  const bodyBox = el(
    'div',
    { class: 'min-h-0 flex-1 overflow-y-auto px-5 py-5 has-shadow-scroll sm:px-6' },
    slot,
    content,
  );
  const actionBox = el('div', { class: 'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6' });

  const panel = el(
    'div',
    {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
      class: `relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop animate-pop sm:max-h-[86dvh] sm:rounded-3xl ${width}`,
    },
    el(
      'header',
      { class: 'flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6' },
      el('div', { class: 'min-w-0' }, heading, lede),
      dismissible
        ? el(
            'button',
            {
              type: 'button',
              onClick: () => close(),
              'aria-label': 'Tutup',
              class: 'inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3 text-[13px] text-ink-soft transition hover:border-line-strong hover:text-ink',
            },
            'Tutup',
          )
        : null,
    ),
    bodyBox,
    actionBox,
  );

  const root = el(
    'div',
    { class: 'absolute inset-0 flex items-end justify-center transition-opacity duration-150 sm:items-center sm:p-6' },
    el('div', {
      class: 'absolute inset-0 bg-ink/35 backdrop-blur-[2px]',
      onClick: () => dismissible && close(),
    }),
    panel,
  );

  function close() {
    if (closed) return;
    closed = true;

    if (toastSlot === slot) toastSlot = previousSlot;
    teardown.forEach((off) => off());
    closers.forEach((fn) => {
      try {
        fn();
      } catch {
        void 0;
      }
    });

    root.style.opacity = '0';
    setTimeout(() => {
      host.replaceChildren();
      host.classList.add('hidden');
      document.body.style.overflow = '';
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    }, 140);
  }

  const handle = {
    root,
    panel,
    body: bodyBox,
    close,
    setTitle: (value) => {
      heading.textContent = value;
    },
    setDescription: (value) => {
      lede.textContent = value ?? '';
      lede.hidden = !value;
    },
    setBody: (node) => {
      content.replaceChildren(...flatten([node]));
      bodyBox.scrollTop = 0;
    },
    setActions: (nodes) => actionBox.replaceChildren(...flatten(nodes)),
    onClose: (fn) => {
      if (typeof fn === 'function') closers.push(fn);
    },
  };

  const onKey = (event) => {
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = [...panel.querySelectorAll(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKey);
  teardown.push(() => document.removeEventListener('keydown', onKey));

  host.classList.remove('hidden');
  host.replaceChildren(root);

  const global = document.getElementById('toast');
  if (global) [...global.children].forEach((node) => slot.append(node));
  toastSlot = slot;

  handle.setBody(body);
  handle.setActions(actions);
  actionBox.hidden = actions.length === 0;
  document.body.style.overflow = 'hidden';

  const target = panel.querySelector('input:not([readonly]), select, textarea, button') ?? panel;
  target.focus?.({ preventScroll: true });

  return handle;
}

export function confirmDialog({
  title = 'Konfirmasi',
  message = '',
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'primary',
} = {}) {
  return new Promise((resolve) => {
    let answer = false;

    const handle = openModal({
      title,
      description: message,
      size: 'sm',
      actions: [
        button({ label: cancelLabel, variant: 'ghost', onClick: () => handle?.close() }),
        button({
          label: confirmLabel,
          variant: tone === 'danger' ? 'danger' : 'primary',
          onClick: () => {
            answer = true;
            handle?.close();
          },
        }),
      ],
    });

    if (!handle) {
      resolve(false);
      return;
    }

    handle.onClose(() => resolve(answer));
  });
}

export function field({
  label = '',
  name = nextId('field'),
  type = 'text',
  value = '',
  placeholder = '',
  hint = '',
  autocomplete = 'off',
  inputMode = null,
  maxLength = null,
  readOnly = false,
  required = false,
  options = null,
  rows = 0,
} = {}) {
  const id = nextId(name);
  const controlClass =
    'w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink transition placeholder:text-ink-mute/75 focus:border-accent focus:outline-none read-only:bg-paper read-only:text-ink-soft';

  const errorNode = el('p', { class: 'text-[12px] font-medium text-[#8f3323]', hidden: true, role: 'alert' });
  const hintNode = el('p', { class: 'text-[12px] leading-relaxed text-ink-mute', hidden: !hint }, hint);

  const control = options
    ? el(
        'select',
        { id, name, class: `h-11 appearance-none ${controlClass}` },
        ...options.map((item) =>
          el('option', { value: item.value ?? item, selected: (item.value ?? item) === value }, item.label ?? item),
        ),
      )
    : rows > 0
      ? el('textarea', { id, name, class: `py-3 ${controlClass}`, rows, placeholder, readOnly, maxLength }, value)
      : el('input', {
          id,
          name,
          type,
          class: `h-11 ${controlClass}`,
          value,
          placeholder,
          autocomplete,
          inputMode,
          maxLength,
          readOnly,
          required,
        });

  const wrap = el(
    'div',
    { class: 'flex flex-col gap-1.5' },
    label
      ? el(
          'label',
          { for: id, class: 'flex items-baseline gap-2 text-[13px] font-medium text-ink-soft' },
          label,
          required ? el('span', { class: 'text-[11px] font-normal text-ink-mute' }, 'wajib') : null,
        )
      : null,
    control,
    errorNode,
    hintNode,
  );

  const api = {
    wrap,
    control,
    hint: hintNode,
    value: () => control.value,
    setValue: (next) => {
      control.value = next ?? '';
    },
    setError: (message) => {
      const text = String(message ?? '').trim();
      errorNode.textContent = text;
      errorNode.hidden = !text;
      control.setAttribute('aria-invalid', text ? 'true' : 'false');
      control.classList.toggle('border-[#d9a99c]', Boolean(text));
    },
    clearError: () => api.setError(''),
  };

  return api;
}

export function showFieldErrors(bindings, result) {
  Object.values(bindings).forEach((api) => api.clearError());
  if (result?.ok !== false || !result?.fields) return false;

  const entries = Object.entries(result.fields).filter(([name]) => bindings[name]);
  entries.forEach(([name, message]) => bindings[name].setError(message));
  entries[0]?.[0] && bindings[entries[0][0]].control.focus();
  return entries.length > 0;
}

export function kodePengajuanPanel({ loan, qrValue = '', catatan = '' } = {}) {
  const holder = el('div', { class: 'w-fit rounded-2xl border border-line bg-white p-3.5' });
  const sisa = el(
    'span',
    { dataset: { until: String(loan.batasAmbil) } },
    formatCountdown(Number(loan.batasAmbil) - Date.now()),
  );

  renderQr(holder, qrValue || loan.id, 232);

  return el(
    'div',
    { class: 'flex flex-col gap-5' },
    el(
      'div',
      { class: 'flex flex-col items-center gap-4 rounded-2xl border border-tunggu-line bg-tunggu-bg px-4 py-5 text-tunggu-fg' },
      holder,
      el('p', { class: 'font-display text-[32px] leading-none tnum' }, loan.id),
      el(
        'p',
        { class: 'max-w-[17rem] text-center text-[12.5px] leading-relaxed opacity-90' },
        'Petugas memindai QR ini untuk menyerahkan buku — berlaku juga kalau petugas memakai perangkat lain.',
      ),
    ),
    dataList(
      dataPair('Judul', loan.bookJudul),
      dataPair('Kode buku', el('span', { class: 'tnum' }, loan.bookKode)),
      dataPair('Sisa waktu', sisa),
      dataPair('Ambil sebelum', el('span', { class: 'tnum' }, formatClock(loan.batasAmbil))),
      dataPair('Peminjam', `${loan.namaSiswa} · ${loan.kelas}`),
    ),
    catatan ? el('p', { class: 'text-[12.5px] leading-relaxed text-ink-mute' }, catatan) : null,
  );
}

export function buktiPanel({ kode, judul, pesan = '', catatan = '' } = {}) {
  if (!kode) return null;

  const alamat = `${location.origin}${location.pathname}#/pinjaman?${RECEIPT_PARAM}=${kode}`;
  const holder = el('div', { class: 'w-fit rounded-2xl border border-line bg-white p-3' });

  renderQr(holder, alamat, 196);

  return el(
    'div',
    { class: 'flex flex-col gap-4 rounded-2xl border border-tuntas-line bg-tuntas-bg p-4 text-tuntas-fg' },
    el(
      'div',
      { class: 'flex flex-col gap-4 sm:flex-row sm:items-start' },
      holder,
      el(
        'div',
        { class: 'flex min-w-0 flex-1 flex-col gap-3' },
        el('p', { class: 'font-display text-[19px] leading-snug' }, judul),
        el(
          'p',
          { class: 'text-[12.5px] leading-relaxed opacity-90' },
          pesan || 'Minta siswa memindai QR ini dengan kamera HP-nya supaya status di layarnya ikut berubah.',
        ),
        el(
          'div',
          { class: 'flex flex-wrap items-center gap-2' },
          button({
            label: 'Salin kode bukti',
            variant: 'outline',
            size: 'sm',
            onClick: async () => {
              const done = await copy(kode);
              toast(done ? 'Kode bukti disalin. Kirim ke siswa.' : 'Gagal menyalin.', { tone: done ? 'sukses' : 'gagal' });
            },
          }),
        ),
        el('p', { class: 'tnum break-all text-[11px] leading-relaxed opacity-70' }, kode),
      ),
    ),
    catatan ? el('p', { class: 'text-[12px] leading-relaxed opacity-80' }, catatan) : null,
  );
}