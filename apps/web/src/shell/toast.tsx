import { cn } from "@refhaven/ui/lib/utils";
import { useEffect, useSyncExternalStore } from "react";

type Toast = {
  readonly id: number;
  readonly message: string;
  readonly action?: { readonly label: string; readonly run: () => void } | undefined;
};

const shownForMs = 5000;
let current: Toast | null = null;
let nextId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Shows one short message at the bottom of the page, with an action when it has one. */
export function toast(message: string, action?: Toast["action"]) {
  current = { id: nextId++, message, action };
  emit();
}

const dismiss = (id: number) => {
  if (current?.id !== id) return;
  current = null;
  emit();
};

/** Where `toast` shows its message. The layout renders one. */
export function Toaster() {
  const shown = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => dismiss(shown.id), shownForMs);
    return () => clearTimeout(timer);
  }, [shown]);
  const action = shown?.action;

  return (
    <div
      aria-live="polite"
      data-testid="toast"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {shown ? (
        <div
          key={shown.id}
          className={cn(
            "pointer-events-auto flex h-11 animate-in items-center gap-3 rounded-full bg-ink pr-1.5 pl-4 text-[14px] font-[520] text-page shadow-float-lg duration-200 fade-in slide-in-from-bottom-2",
            !action && "pr-4",
          )}
        >
          {shown.message}
          {action ? (
            <button
              type="button"
              onClick={() => {
                action.run();
                dismiss(shown.id);
              }}
              className="h-8 rounded-full px-3 font-[580] text-page outline-offset-0 hover:bg-[color-mix(in_srgb,var(--page)_14%,transparent)]"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
