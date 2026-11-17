import { Link } from "@tanstack/react-router";

type View = "gallery" | "canvas";

/** Reads `view` from a page's search parameters. A page with no valid `view` is the gallery. */
export const validateView = (search: Record<string, unknown>): { view?: View } =>
  search.view === "canvas" || search.view === "gallery" ? { view: search.view } : {};

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
