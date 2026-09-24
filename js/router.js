import { APP, FALLBACK_ROUTE, HOME_ROUTE, ROUTES } from './config.js';
import { getSession } from './session.js';

const registry = new Map(ROUTES.map((route) => [route.path, route]));
const loaded = new Map();

const asHash = (value) => {
  const text = String(value ?? '').trim();
  if (!text || text === '#') return FALLBACK_ROUTE;

  const prefixed = text.startsWith('#') ? text : `#${text.startsWith('/') ? '' : '/'}${text}`;
  const [head, ...tail] = prefixed.split('?');
  const path = head.length > 2 ? head.replace(/\/+$/, '') : head;

  return [path, ...tail].join('?');
};

const parseHash = (value) => {
  const [path, query = ''] = asHash(value).split('?');
  return { path, query: new URLSearchParams(query) };
};

const composeHash = (path, query) => {
  const text = query instanceof URLSearchParams ? query.toString() : String(query ?? '');
  return text ? `${path}?${text}` : path;
};

const homeFor = (session) => HOME_ROUTE[session?.role] ?? FALLBACK_ROUTE;

const judge = (path, session) => {
  const route = registry.get(path);
  if (!route) return { redirect: homeFor(session) };
  if (!route.peran) return session ? { redirect: homeFor(session) } : { route };
  if (!session) return { redirect: FALLBACK_ROUTE, notice: 'BELUM_MASUK' };
  if (!route.peran.includes(session.role)) return { redirect: homeFor(session), notice: 'AKSES_DITOLAK' };
  return { route };
};

const asNode = (value) => {
  if (value instanceof Node) return value;
  if (Array.isArray(value)) {
    const fragment = document.createDocumentFragment();
    value.filter((item) => item instanceof Node).forEach((item) => fragment.append(item));
    return fragment;
  }
  return document.createTextNode('');
};

const failurePanel = (message) => {
  const wrap = document.createElement('div');
  wrap.className = 'mx-auto w-full max-w-shell px-5 py-16 sm:px-8';

  const title = document.createElement('p');
  title.className = 'font-display text-3xl';
  title.textContent = 'Halaman gagal dimuat';

  const detail = document.createElement('p');
  detail.className = 'mt-2 max-w-md text-sm leading-relaxed text-ink-soft';
  detail.textContent = message;

  const action = document.createElement('button');
  action.type = 'button';
  action.className =
    'mt-6 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition duration-200 hover:bg-accent';
  action.textContent = 'Muat ulang halaman';
  action.addEventListener('click', () => window.location.reload());

  wrap.append(title, detail, action);
  return wrap;
};

export function createRouter({ outlet, onNotice, onNavigate, onError } = {}) {
  const softHandlers = new Set();
  let cleanups = [];
  let token = 0;

  const run = (fn) => {
    try {
      fn();
    } catch (error) {
      onError?.(error);
    }
  };

  const loadPage = (modulePath) => {
    if (!loaded.has(modulePath)) {
      const promise = import(modulePath).catch((error) => {
        loaded.delete(modulePath);
        throw error;
      });
      loaded.set(modulePath, promise);
    }
    return loaded.get(modulePath);
  };

  function render({ keepScroll = false } = {}) {
    return draw({ keepScroll });
  }

  const patchQuery = (patch) => {
    const { path, query } = parseHash(window.location.hash);

    Object.entries(patch).forEach(([key, value]) => {
      const text = value === null || value === undefined ? '' : String(value);
      if (text === '') query.delete(key);
      else query.set(key, text);
    });

    const target = composeHash(path, query);
    if (target === asHash(window.location.hash)) return;

    window.history.replaceState(null, '', target);
  };

  const navigate = (path, { replace = false, force = false } = {}) => {
    const target = asHash(path);

    if (asHash(window.location.hash) === target && !force) {
      render({ keepScroll: true });
      return;
    }

    if (replace) {
      window.location.replace(target);
      return;
    }

    window.location.hash = target;
  };

  async function draw({ keepScroll }) {
    const mine = (token += 1);
    const { path, query } = parseHash(window.location.hash);
    const session = getSession();
    const outcome = judge(path, session);

    if (outcome.redirect) {
      if (outcome.notice) onNotice?.(outcome.notice);
      if (outcome.redirect !== asHash(window.location.hash)) window.location.replace(outcome.redirect);
      return;
    }

    const { route } = outcome;
    const scroll = window.scrollY;

    let page;
    try {
      page = await loadPage(route.modul);
    } catch (error) {
      onError?.(error);
      if (mine !== token) return;
      cleanups.forEach(run);
      cleanups = [];
      softHandlers.clear();
      outlet.replaceChildren(failurePanel('Modul halaman tidak dapat dimuat. Periksa koneksi lalu muat ulang.'));
      onNavigate?.({ route, session, query });
      return;
    }

    if (mine !== token) return;

    const previous = cleanups;
    cleanups = [];
    softHandlers.clear();
    previous.forEach(run);

    const bucket = [];
    const context = {
      route,
      session,
      query,
      navigate,
      patchQuery,
      refresh: () => render({ keepScroll: true }),
      onCleanup: (fn) => {
        if (typeof fn === 'function') bucket.push(fn);
      },
      onExternalChange: (fn) => {
        if (typeof fn !== 'function') return () => false;
        softHandlers.add(fn);
        return () => softHandlers.delete(fn);
      },
    };

    let node;
    try {
      node = await page.render(context);
    } catch (error) {
      onError?.(error);
      node = failurePanel('Terjadi kesalahan saat menggambar halaman ini.');
    }

    if (mine !== token) {
      bucket.forEach(run);
      return;
    }

    cleanups = bucket;
    outlet.replaceChildren(asNode(node));
    document.title = `${route.judul} · ${APP.nama}`;

    if (keepScroll) {
      window.scrollTo({ top: scroll });
    } else {
      outlet.focus?.({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }

    onNavigate?.({ route, session, query });
  }

  const notifyExternalChange = (payload = {}) => {
    if (softHandlers.size === 0) return false;
    softHandlers.forEach((fn) => run(() => fn(payload)));
    return true;
  };

  const start = () => {
    window.addEventListener('hashchange', () => render());
    render();
  };

  return { start, navigate, patchQuery, notifyExternalChange, refresh: () => render({ keepScroll: true }) };
}