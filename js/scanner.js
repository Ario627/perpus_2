import { CAMERA_PROBE_MS, SCAN_BOX, SCAN_DEBOUNCE_MS, SCAN_FPS, SCAN_RESUME_MS } from './config.js';
import { fail, ok } from './result.js';

const CREDENTIAL_ERRORS = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError']);
const DEVICE_ERRORS = new Set(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']);
const BUSY_ERRORS = new Set(['NotReadableError', 'TrackStartError', 'AbortError']);
const REAR_HINTS = [/back/i, /belakang/i, /rear/i, /environment/i, /wide/i];

const normalise = (value) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

const secureEnough = () => {
  if (!globalThis.isSecureContext) return false;
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) return false;
  return true;
};

export function cameraSupport() {
  if (typeof globalThis.Html5Qrcode !== 'function') {
    return fail('KAMERA_GAGAL', 'Pustaka pemindai belum termuat. Periksa koneksi lalu muat ulang.');
  }

  if (!globalThis.isSecureContext) {
    return fail(
      'KAMERA_DIBLOKIR',
      'Browser memblokir kamera karena alamat ini bukan localhost/HTTPS. Pakai kode manual, atau buka aplikasi lewat localhost atau HTTPS.',
    );
  }

  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    return fail('KAMERA_GAGAL', 'Browser ini tidak menyediakan akses kamera. Pakai kode manual.');
  }

  return ok(true);
}

const withDeadline = (promise, ms) =>
  Promise.race([
    promise.then((value) => value).catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

const boxShape = (width, height) => {
  const side = Math.round(Math.min(width, height) * 0.7);
  return { width: Math.max(150, Math.min(SCAN_BOX + 60, side)), height: Math.max(150, Math.min(SCAN_BOX + 60, side)) };
};

const rearCameraId = async (ctor) => {
  try {
    const devices = await withDeadline(ctor.getCameras(), CAMERA_PROBE_MS);
    if (!Array.isArray(devices) || devices.length === 0) return null;

    const rear = devices.find((device) => REAR_HINTS.some((hint) => hint.test(device.label ?? '')));
    return (rear ?? devices[devices.length - 1])?.id ?? null;
  } catch {
    return null;
  }
};

export function describeCameraFailure(error) {
  const name = String(error?.name ?? error?.message ?? '');

  if (!secureEnough()) {
    return fail(
      'KAMERA_DIBLOKIR',
      'Browser memblokir kamera karena alamat ini bukan localhost/HTTPS. Pakai kode manual, atau buka aplikasi lewat localhost atau HTTPS.',
    );
  }

  if (CREDENTIAL_ERRORS.has(name)) return fail('KAMERA_GAGAL', 'Izin kamera ditolak. Aktifkan izin lalu coba lagi.');
  if (DEVICE_ERRORS.has(name)) return fail('KAMERA_GAGAL', 'Kamera tidak tersedia. Pakai input kode manual.');
  if (BUSY_ERRORS.has(name)) return fail('KAMERA_GAGAL', 'Kamera sedang dipakai aplikasi lain.');
  return fail('KAMERA_GAGAL', 'Kamera gagal dibuka. Pakai input kode manual.');
}

export function createScanner({ elementId, onCode, onState = () => {} } = {}) {
  const state = { instance: null, phase: 'idle', busy: false, seen: { code: '', at: 0 }, resumeTimer: null };
  let generation = 0;

  const announce = (phase, detail = null) => {
    state.phase = phase;
    onState(phase, detail);
  };

  const hold = () => {
    try {
      state.instance?.pause(true);
    } catch {
      void 0;
    }
  };

  const cancelResume = () => {
    clearTimeout(state.resumeTimer);
    state.resumeTimer = null;
  };

  const release = () => {
    cancelResume();
    state.resumeTimer = setTimeout(() => {
      state.resumeTimer = null;
      if (state.phase !== 'running') return;
      try {
        state.instance?.resume();
      } catch {
        void 0;
      }
    }, SCAN_RESUME_MS);
  };

  const accept = async (raw) => {
    const code = normalise(raw);
    if (!code || state.busy || state.phase === 'idle') return;

    const now = Date.now();
    if (code === state.seen.code && now - state.seen.at < SCAN_DEBOUNCE_MS) return;

    state.seen = { code, at: now };
    state.busy = true;
    hold();

    try {
      await onCode?.(code);
    } finally {
      state.busy = false;
      if (state.phase !== 'idle') release();
    }
  };

  const build = () => {
    const ctor = globalThis.Html5Qrcode;
    if (typeof ctor !== 'function') return fail('KAMERA_GAGAL', 'Pustaka pemindai belum termuat. Periksa koneksi.');

    const target = document.getElementById(elementId);
    if (!target) return fail('VALIDASI', 'Area kamera tidak tersedia.');

    if (state.instance) return ok(state.instance);

    target.replaceChildren();

    try {
      state.instance = new ctor(elementId, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
    } catch {
      return fail('KAMERA_GAGAL', 'Area kamera tidak siap. Muat ulang halaman.');
    }

    return ok(state.instance);
  };

  async function start() {
    if (state.phase === 'running') return ok(true);

    const didukung = cameraSupport();
    if (!didukung.ok) {
      announce('error', didukung);
      return didukung;
    }

    const mine = (generation += 1);
    announce('starting');

    const ready = build();
    if (!ready.ok) {
      announce('idle');
      return ready;
    }

    const instance = ready.data;

    if (!instance) {
      announce('idle');
      return fail('KAMERA_GAGAL', 'Pemindai belum siap.');
    }

    const ctor = globalThis.Html5Qrcode;
    const rear = await rearCameraId(ctor);

    if (mine !== generation) return fail('KAMERA_GAGAL', 'Pemindaian dibatalkan.');

    const strategies = [
      rear ? { deviceId: { exact: rear } } : null,
      { facingMode: 'environment' },
      { facingMode: 'user' },
    ].filter(Boolean);

    const settings = { fps: SCAN_FPS, qrbox: boxShape, disableFlip: false };
    let lastError = null;

    for (const camera of strategies) {
      try {
        await instance.start(camera, settings, (text) => void accept(text), () => void 0);

        if (mine !== generation) {
          try {
            await instance.stop();
          } catch {
            void 0;
          }
          return fail('KAMERA_GAGAL', 'Pemindaian dibatalkan.');
        }

        announce('running');
        return ok(true);
      } catch (error) {
        lastError = error;

        try {
          await instance.stop();
        } catch {
          void 0;
        }
        try {
          instance.clear();
        } catch {
          void 0;
        }

        state.instance = null;

        if (mine !== generation) return fail('KAMERA_GAGAL', 'Pemindaian dibatalkan.');
        if (CREDENTIAL_ERRORS.has(error?.name)) break;

        const rebuilt = build();
        if (!rebuilt.ok) break;
      }
    }

    if (mine !== generation) return fail('KAMERA_GAGAL', 'Pemindaian dibatalkan.');

    const failure = describeCameraFailure(lastError);
    announce('error', failure);
    return failure;
  }

  async function stop() {
    generation += 1;
    cancelResume();
    state.busy = false;

    const instance = state.instance;
    state.instance = null;

    if (!instance) {
      announce('idle');
      return ok(true);
    }

    try {
      await instance.stop();
    } catch {
      void 0;
    }
    try {
      instance.clear();
    } catch {
      void 0;
    }

    announce('idle');
    return ok(true);
  }

  const torchReady = () => {
    try {
      const caps = state.instance?.getRunningTrackCapabilities?.();
      return caps?.torch === true;
    } catch {
      return false;
    }
  };

  const setTorch = async (on) => {
    if (!state.instance) return fail('KAMERA_GAGAL', 'Pemindai belum aktif.');

    try {
      await state.instance.applyVideoConstraints({ advanced: [{ torch: Boolean(on) }] });
      return ok(Boolean(on));
    } catch {
      return fail('KAMERA_GAGAL', 'Senter tidak didukung perangkat ini.');
    }
  };

  return {
    start,
    stop,
    setTorch,
    torchReady,
    phase: () => state.phase,
    running: () => state.phase === 'running',
    forget: () => {
      state.seen = { code: '', at: 0 };
    },
  };
}
