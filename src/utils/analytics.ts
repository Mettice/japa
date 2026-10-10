// Cookie-free, ID-free event counter. Events carry no personal data: just a name,
// a few game properties and a timestamp. Logs to the console in dev; when
// VITE_ANALYTICS_URL is set, batches are sent there with sendBeacon (stub endpoint).

export type AnalyticsEvent =
  | { name: 'run_start'; city: string; mode: 'normal' | 'daily' | 'journey' }
  | { name: 'ending_reached'; ending: string; stage: number; cards: number; mode: 'normal' | 'daily' | 'journey' }
  | { name: 'share_clicked'; format: string; method: 'web_share' | 'download' | 'cancelled' }
  | { name: 'ad_clicked'; ad: string; placement: string };

const ENDPOINT = import.meta.env.VITE_ANALYTICS_URL as string | undefined;
const FLUSH_MS = 5000;

let queue: (AnalyticsEvent & { t: number })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const flush = () => {
  timer = null;
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  if (!ENDPOINT) return; // stub: nothing to send to yet
  try {
    const body = JSON.stringify({ events: batch });
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  } catch {}
};

export const track = (event: AnalyticsEvent) => {
  if (import.meta.env.DEV) console.debug('[analytics]', event.name, event);
  queue.push({ ...event, t: Date.now() });
  timer ??= setTimeout(flush, FLUSH_MS);
};

// Don't lose the last events when the tab is closed or backgrounded
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
