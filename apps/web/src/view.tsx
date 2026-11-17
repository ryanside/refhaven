import { SearchQuery, TagName } from "@refhaven/backend/refFields";
import { Link } from "@tanstack/react-router";
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
 * Reads a gallery page's search parameters. A page with no valid `view` is the gallery. A search
 * text or a tag that the server would refuse is left out. A tag is put in its normal form, so
 * `?tag=Mood` filters by `mood`.
 */
export const validateGallerySearch = (
  search: Record<string, unknown>,
): { view?: View } & Filters => {
  const q = decoded(SearchQuery, search.q);
  const tag = decoded(TagName, search.tag);
  return {
    ...(search.view === "canvas" || search.view === "gallery" ? { view: search.view } : {}),
    ...(q === undefined ? {} : { q }),
    ...(tag === undefined ? {} : { tag }),
  };
};

/** Switches the current page between its gallery and its canvas. */
export function ViewLinks() {
  return (
    <nav className="flex gap-3">
      <Link to="." search={{ view: "gallery" }} className="underline">
        Gallery
      </Link>
      <Link to="." search={{ view: "canvas" }} className="underline">
        Canvas
      </Link>
    </nav>
  );
}
