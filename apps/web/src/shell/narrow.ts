import { useSyncExternalStore } from "react";

const query = "(max-width: 719px)";

/** Whether the window is narrow, where the top bar folds its pages into a menu. */
export function useNarrow() {
  return useSyncExternalStore(
    (changed) => {
      const media = matchMedia(query);
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
