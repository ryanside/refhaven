import { SearchQuery, TagName } from "@refhaven/backend/refFields";
import { CanvasIcon, GridViewIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@refhaven/ui/components/icon";
import { Segmented, segmentClass } from "@refhaven/ui/components/segmented";
import { Link, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

type View = "gallery" | "canvas";

/** A gallery's filters. An absent one is off. */
export type Filters = { readonly q?: string; readonly tag?: string };

// The router reads a hand-typed `?q=123`, `?q=true`, or `?q=null` as a number, a boolean, or null.
// Each is the text the owner typed. A string the page wrote itself comes back as a string.
const decoded = (schema: Schema.Decoder<string>, value: unknown) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(schema)(
      value === null || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value,
    ),
  );

/**
 * Reads a gallery's filters from the search parameters. A search text or a tag that the server
 * would refuse is left out. A tag is put in its normal form, so `?tag=Mood` filters by `mood`.
 */
export const validateGallerySearch = (search: Record<string, unknown>): Filters => {
  const q = decoded(SearchQuery, search.q);
  const tag = decoded(TagName, search.tag);
  return {
    ...(q === undefined ? {} : { q }),
    ...(tag === undefined ? {} : { tag }),
  };
};

/** Reads a collection page's search parameters. A page with no valid `view` is the canvas. */
export const validateCollectionSearch = (
  search: Record<string, unknown>,
): { view?: View } & Filters => ({
  ...(search.view === "canvas" || search.view === "gallery" ? { view: search.view } : {}),
  ...validateGallerySearch(search),
});

const views = [
  { view: "canvas", label: "Canvas", icon: CanvasIcon },
  { view: "gallery", label: "Gallery", icon: GridViewIcon },
] as const;

/** Switches a collection's page between its canvas and its gallery, and marks the one it shows. */
export function ViewLinks() {
  const current = useSearch({ strict: false, select: (search) => search.view ?? "canvas" });
  return (
    <Segmented aria-label="View">
      {views.map(({ view, label, icon }) => (
        <Link
          key={view}
          to="."
          search={{ view }}
          aria-current={view === current ? "page" : undefined}
          className={segmentClass}
        >
          <Icon icon={icon} size={16} />
          {label}
        </Link>
      ))}
    </Segmented>
  );
}
