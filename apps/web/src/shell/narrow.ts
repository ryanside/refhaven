import { useSyncExternalStore } from "react";

const query = "(max-width: 719px)";

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
