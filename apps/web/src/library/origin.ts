import type { Id } from "@refhaven/backend/id";
import { createContext, useContext } from "react";

/** The collection whose gallery a tile is shown in, if any. */
export type Origin = { readonly collectionId: Id<"collections">; readonly name: string };

export const OriginContext = createContext<Origin | null>(null);

/** The gallery an image's page was opened from, so its breadcrumb can lead back there. */
let opened: { readonly refId: Id<"refs">; readonly origin: Origin | null } | null = null;

export const useOrigin = () => useContext(OriginContext);

export const rememberOpened = (refId: Id<"refs">, origin: Origin | null) => {
  opened = { refId, origin };
};

/** The collection the page of `refId` was opened from, or null for the library. */
export const openedFrom = (refId: Id<"refs">) => (opened?.refId === refId ? opened.origin : null);
