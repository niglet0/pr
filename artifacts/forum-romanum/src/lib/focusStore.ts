// Tiny global store for "Deep Focus" sandbox mode.
// Used by AppShell to hide nav/header and by HomeView's toggle.
import { useSyncExternalStore } from "react";

type State = { active: boolean };
let state: State = { active: false };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const focusStore = {
  get: () => state,
  set: (next: Partial<State>) => {
    state = { ...state, ...next };
    emit();
  },
  toggle: () => focusStore.set({ active: !state.active }),
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useDeepFocus() {
  const s = useSyncExternalStore(
    focusStore.subscribe,
    () => focusStore.get(),
    () => focusStore.get()
  );
  return { active: s.active, setActive: (v: boolean) => focusStore.set({ active: v }), toggle: focusStore.toggle };
}
