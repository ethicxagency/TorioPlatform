export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  /** Playing the exit animation; removed right after. */
  leaving: boolean;
}

const MAX_VISIBLE = 4;
const EXIT_MS = 200;
const LIFETIME: Record<ToastKind, number> = {
  success: 3000,
  info: 3600,
  warning: 5000,
  error: 5000,
};

let items: ToastItem[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const set = (next: ToastItem[]) => {
  items = next;
  emit();
};

export const subscribeToasts = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const getToasts = () => items;

function remove(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  set(items.filter((t) => t.id !== id));
}

function dismiss(id?: number) {
  if (id === undefined) {
    items.forEach((t) => dismiss(t.id));
    return;
  }
  const t = items.find((x) => x.id === id);
  if (!t || t.leaving) return;
  clearTimeout(timers.get(id));
  set(items.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
  timers.set(
    id,
    setTimeout(() => remove(id), EXIT_MS),
  );
}

function arm(id: number, kind: ToastKind) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => dismiss(id), LIFETIME[kind]),
  );
}

function push(kind: ToastKind, text: string): number {
  const message = text.trim();
  if (!message) return -1;
  // The same message already on screen (a double click, a repeated callback) is extended, not stacked.
  const dup = items.find((t) => t.kind === kind && t.text === message && !t.leaving);
  if (dup) {
    arm(dup.id, kind);
    return dup.id;
  }
  const id = nextId++;
  const next = [...items, { id, kind, text: message, leaving: false }];
  const live = next.filter((t) => !t.leaving);
  if (live.length > MAX_VISIBLE) dismiss(live[0]!.id);
  set(next);
  arm(id, kind);
  return id;
}

/** Messages from older call sites that pass only text: failures and unavailable actions are not "success". */
const FAILURE =
  /^(couldn[’']?t|could not|can[’']?t|cannot|unable|failed|something went wrong|no .* to )/i;
const UNAVAILABLE = /(isn[’']?t|is not) available yet/i;
function infer(text: string): ToastKind {
  if (UNAVAILABLE.test(text)) return 'info';
  return FAILURE.test(text.trim()) ? 'error' : 'success';
}

/**
 * The one notification API. `toast.success('Order updated successfully.')` after the server confirms,
 * `toast.error(...)` for failures. `toast(text)` infers the kind (success unless it reads as a failure).
 */
export const toast = Object.assign((text: string) => push(infer(text), text), {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
  warning: (text: string) => push('warning', text),
  info: (text: string) => push('info', text),
  dismiss,
});
export type Toast = typeof toast;
