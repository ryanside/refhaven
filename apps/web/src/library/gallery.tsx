import { PaginatedQueryResult } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import { Button } from "@refhaven/ui/components/button";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { useRefUrls } from "@/library/use-ref-urls";

type Item = {
  readonly refId: Id<"refs">;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly thumbHash: string | null;
};

const pageSize = 60;
export const galleryPage = { initialNumItems: pageSize };

/** Renders a control on each card. */
export type CardAction = (refId: Id<"refs">) => ReactNode;

/** Images as a grid of cards, each linking to its page. */
export function Cards({ items, action }: { items: ReadonlyArray<Item>; action: CardAction }) {
  const refIds = useMemo(() => items.map((item) => item.refId), [items]);
  const urls = useRefUrls(refIds, "thumbnail");

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
      {items.map((item) => (
        <li key={item.refId} data-ref-id={item.refId} className="flex flex-col gap-1">
          <Link to="/r/$refId" params={{ refId: item.refId }}>
            <Thumbnail item={item} url={urls.get(item.refId)?.url} />
          </Link>
          <p className="truncate">{item.fileName}</p>
          {action(item.refId)}
        </li>
      ))}
    </ul>
  );
}

/** A set of Refs, loaded a page at a time. */
export function Gallery<E extends { readonly _tag: string }>({
  items,
  action,
  empty = "Nothing saved yet.",
}: {
  items: PaginatedQueryResult.PaginatedQueryResult<Item, E>;
  action: CardAction;
  empty?: string;
}) {
  return (
    <>
      <Cards items={items.results} action={action} />
      {PaginatedQueryResult.isLoading(items) ? <p>Loading…</p> : null}
      {PaginatedQueryResult.isFailure(items) ? <p role="alert">{items.error._tag}</p> : null}
      {PaginatedQueryResult.isExhausted(items) && items.results.length === 0 ? (
        <p>{empty}</p>
      ) : null}
      {PaginatedQueryResult.isCanLoadMore(items) ? (
        <Button variant="outline" className="self-start" onClick={() => items.loadMore(pageSize)}>
          Load more
        </Button>
      ) : null}
    </>
  );
}

function Thumbnail({ item, url }: { item: Item; url: string | undefined }) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = useMemo(
    () =>
      item.thumbHash === null
        ? undefined
        : `url(${thumbHashToDataURL(Uint8Array.from(atob(item.thumbHash), (c) => c.charCodeAt(0)))})`,
    [item.thumbHash],
  );

  return (
    <img
      // Every image load is a CORS request. A response cached from a plain <img> has
      // no CORS headers, and a later canvas load of the same URL would fail on it.
      crossOrigin="anonymous"
      src={url}
      alt={item.fileName}
      width={item.width}
      height={item.height}
      onLoad={() => setLoaded(true)}
      style={loaded ? undefined : { backgroundImage: placeholder, backgroundSize: "100% 100%" }}
      className="h-auto w-full"
    />
  );
}
