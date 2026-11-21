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

/** How an image's page was opened: from `origin`, whose images are `order`. */
export type Opened = {
  readonly origin: Origin;
  readonly order: ReadonlyArray<Id<"refs">>;
  /** Whether the list page that opened the image is the history entry behind the image's page. */
  readonly listBehind: boolean;
};

let opened: (Opened & { readonly refId: Id<"refs"> }) | null = null;

export const rememberOpened = (refId: Id<"refs">, how: Opened) => {
  opened = { refId, ...how };
};

/** How the page of `refId` was opened, or null when it was not opened from a list. */
export const openedFrom = (refId: Id<"refs">): Opened | null =>
  opened?.refId === refId ? opened : null;
