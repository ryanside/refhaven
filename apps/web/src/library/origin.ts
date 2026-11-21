import type { Id } from "@refhaven/backend/id";
import { createContext, useContext } from "react";

export type Origin =
  | { readonly kind: "library" }
  | { readonly kind: "trash" }
  | {
      readonly kind: "collection";
      readonly collectionId: Id<"collections">;
      readonly name: string;
    };

export const libraryOrigin: Origin = { kind: "library" };

export const OriginContext = createContext<Origin>(libraryOrigin);

export const useOrigin = () => useContext(OriginContext);

type Opened = { readonly origin: Origin; readonly order: ReadonlyArray<Id<"refs">> };

let opened: (Opened & { readonly refId: Id<"refs"> }) | null = null;

/** Notes that the page of `refId` opens from `origin`, whose images are `order`. */
export const rememberOpened = (
  refId: Id<"refs">,
  origin: Origin,
  order: ReadonlyArray<Id<"refs">>,
) => {
  opened = { refId, origin, order };
};

/** Where the page of `refId` was opened from, or null when it was not opened from a list. */
export const openedFrom = (refId: Id<"refs">): Opened | null =>
  opened?.refId === refId ? opened : null;
