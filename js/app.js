import {
  APP,
  COUNTDOWN_INTERVAL_MS,
  DUE_SOON_MS,
  ERRORS,
  EXPIRE_CHECK_INTERVAL_MS,
  HOME_ROUTE,
  NAV,
  ROLES,
  ROLE_LABEL,
} from './config.js';
import { expireOverdueLoans } from './loans.js';
import { getSession, signOut } from './session.js';
import { onExternalWrite, isPersistent, seedIfEmpty } from './storage.js';
import { createRouter } from './router.js';
import { button, dataList, dataPair, el, formatCountdown, openModal, toast } from './ui/components.js';

const appbar = document.getElementById('appbar');
const appfoot = document.getElementById('appfoot');
const view = document.getElementById('view');

const mark = () =>
  el(
    'span',
    { class: 'grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent' },
    el(
      'span',
      { class: 'flex items-end gap-[2px]' },
      el('span', { class: 'h-3 w-[2px] rounded-full bg-paper' }),
      el('span', { class: 'h-2 w-[2px] rounded-full bg-paper/70' }),
      el('span', { class: 'h-[6px] w-[2px] rounded-full bg-paper/45' }),
    ),
  );

const shortName = (session) => (session.role === ROLES.PETUGAS ? ROLE_LABEL[ROLES.PETUGAS] : session.nama.split(' ')[0]);

const identityOf = (session) => (session.role === ROLES.PETUGAS ? ROLE_LABEL[ROLES.PETUGAS] : `${session.nama} · ${session.kelas}`);

function boot() {
  const sinkron = ({ changed = false, expired = 0 } = {}) => {
    if (router.notifyExternalChange({ changed, expired })) return;
    if (changed || expired > 0) router.refresh();
  };

  const keluar = () => {
    signOut();
    toast('Kamu sudah keluar dari sesi ini.');
    router.navigate('#/masuk');
  };

  const bukaAkun = (session) => {
    const modal = openModal({
      title: identityOf(session),
      description: session.role === ROLES.PETUGAS ? 'Akses penuh ke koleksi, QR, dan verifikasi serah terima.' : ROLE_LABEL[session.role],
      size: 'sm',
      body: dataList(
        dataPair('Peran', ROLE_LABEL[session.role]),
        session.nama ? dataPair('Nama', session.nama) : null,
        session.kelas ? dataPair('Kelas', session.kelas) : null,
        dataPair('Penyimpanan', 'Browser perangkat ini'),
      ),
      actions: [
        button({ label: 'Tutup', variant: 'ghost', onClick: () => modal.close() }),
        button({
          label: 'Ganti peran',
          variant: 'ink',
          onClick: () => {
            modal.close();
            keluar();
          },
        }),
      ],
    });
  };

  const renderChrome = (session, route) => {
    const active = route?.path ?? '';
    const items = session ? NAV[session.role] ?? [] : [];

    const link = (item, style) =>
      el(
        'a',
        {
          href: item.href,
          'aria-current': item.href === active ? 'page' : null,
          class: style(item.href === active),
        },
        item.label,
      );

    const desktopNav = el(
      'nav',
      { class: 'hidden items-center gap-1 sm:flex', 'aria-label': 'Navigasi utama' },
      ...items.map((item) =>
        link(
          item,
          (on) =>
            `rounded-full px-3.5 py-2 text-[13.5px] transition duration-200 ${
              on ? 'bg-accent-soft text-accent-deep' : 'text-ink-soft hover:bg-paper hover:text-ink'
            }`,
        ),
      ),
    );

    const akunDesktop = session
      ? el(
          'div',
          { class: 'hidden items-center gap-3 sm:flex' },
          el('span', { class: 'max-w-[15rem] truncate text-[13px] text-ink-soft' }, identityOf(session)),
          button({ label: 'Ganti peran', variant: 'outline', size: 'sm', onClick: keluar }),
        )
      : null;

    const akunMobile = session
      ? el(
          'button',
          {
            type: 'button',
            onClick: () => bukaAkun(session),
            class: 'flex max-w-[9.5rem] items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft transition duration-200 hover:border-line-strong hover:text-ink sm:hidden',
          },
          el('span', { class: 'h-1.5 w-1.5 shrink-0 rounded-full bg-accent' }),
          el('span', { class: 'truncate' }, shortName(session)),
        )
      : null;

    appbar.replaceChildren(
      el(
        'div',
        { class: 'border-b border-line/80 bg-paper/85 backdrop-blur' },
        el(
          'div',
          { class: 'mx-auto flex h-14 w-full max-w-shell items-center justify-between gap-4 px-5 sm:h-16 sm:px-8' },
          el(
            'a',
            { href: session ? HOME_ROUTE[session.role] : '#/masuk', class: 'flex items-center gap-2.5' },
            mark(),
            el('span', { class: 'font-display text-[19px] leading-none' }, APP.nama),
          ),
          desktopNav,
          el('div', { class: 'flex items-center gap-3' }, akunDesktop, akunMobile),
        ),
      ),
    );

    const bottomNav = el(
      'nav',
      {
        class: 'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur sm:hidden',
        'aria-label': 'Navigasi bawah',
      },
      el(
        'div',
        { class: 'mx-auto flex w-full max-w-shell items-stretch px-2 pb-[env(safe-area-inset-bottom)]' },
        ...items.map((item) =>
          el(
            'a',
            {
              href: item.href,
              'aria-current': item.href === active ? 'page' : null,
              class: `relative flex flex-1 flex-col items-center px-2 pb-3 pt-3.5 text-[11.5px] font-medium transition duration-200 ${
                item.href === active ? 'text-accent-deep' : 'text-ink-mute'
              }`,
            },
            item.short ?? item.label,
            item.href === active ? el('span', { class: 'absolute inset-x-4 top-0 h-[2px] rounded-full bg-accent' }) : null,
          ),
        ),
      ),
    );

    const footer = el(
      'footer',
      { class: 'hidden border-t border-line sm:block' },
      el(
        'div',
        { class: 'mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-3 px-8 py-6 text-[12.5px] text-ink-mute' },
        el('p', {}, `${APP.nama} · ${APP.tagline}`),
        el('p', { class: 'tnum' }, `Versi ${APP.versi} · data tersimpan di browser ini`),
      ),
    );

    appfoot.replaceChildren(bottomNav, footer);
  };

  const router = createRouter({
    outlet: view,
    onNotice: (code) => toast(ERRORS[code] ?? 'Akses ditolak.', { tone: 'gagal' }),
    onNavigate: ({ route, session }) => renderChrome(session, route),
    onError: (error) => {
      console.error(error);
      toast('Terjadi kesalahan tak terduga. Coba muat ulang halaman.', { tone: 'gagal' });
    },
  });

  const tick = () => {
    const now = Date.now();
    let lapsed = false;

    document.querySelectorAll('[data-until]').forEach((node) => {
      const until = Number(node.dataset.until);
      if (!Number.isFinite(until)) return;

      const left = until - now;
      node.textContent = formatCountdown(left);
      node.dataset.urgency = left <= DUE_SOON_MS ? 'segera' : 'normal';

      if (left <= 0 && node.dataset.lapsed !== '1') {
        node.dataset.lapsed = '1';
        lapsed = true;
      }
    });

    if (lapsed) sinkron({ expired: expireOverdueLoans(now) });
  };

  seedIfEmpty();
  renderChrome(getSession(), null);
  router.start();

  if (!isPersistent()) {
    toast('Penyimpanan browser diblokir. Data hanya bertahan selama tab ini terbuka.', { tone: 'gagal', duration: 7000 });
  }

  setInterval(tick, COUNTDOWN_INTERVAL_MS);

  setInterval(() => sinkron({ expired: expireOverdueLoans() }), EXPIRE_CHECK_INTERVAL_MS);

  onExternalWrite(() => sinkron({ changed: true, expired: expireOverdueLoans() }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    sinkron({ expired: expireOverdueLoans() });
  });
}

boot();
