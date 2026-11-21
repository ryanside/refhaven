import { PaginatedQueryResult, useMutation, usePaginatedQuery } from "@confect/react";
import { ArrowTurnBackwardIcon, Clock01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { daysLeft, trashDays } from "@refhaven/backend/trash";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { galleryPage } from "@/library/gallery";
import { ShownName } from "@/library/name";
import { rememberOpened } from "@/library/origin";
import { useRefUrls } from "@/library/use-ref-urls";
import { TopBar } from "@/shell/top-bar";
import { RetryingImg } from "@/library/retrying-img";

export const Route = createFileRoute("/_app/trash")({
  component: Trash,
});

type Trashed = {
  readonly refId: Id<"refs">;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly thumbHash: string | null;
  readonly deletedAt: number;
};

function Trash() {
  const items = usePaginatedQuery(refs.public.library.trash, {}, galleryPage);
  const count = items.results.length;
  const more = PaginatedQueryResult.isCanLoadMore(items);

  return (
    <>
      <TopBar />
      <main className="px-gutter pt-[92px] pb-28">
        <h1 className="flex items-baseline gap-2 text-[18px] leading-6 font-[600] tracking-[-0.02em]">
          Trash
          {count > 0 ? (
            <span className="font-[450] text-ink-3 num">
              {count}
              {more ? "+" : ""}
            </span>
          ) : null}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-[15px] leading-[22px] text-ink-2">
          <Icon icon={Clock01Icon} size={16} className="shrink-0 text-ink-3" />
          Images here are permanently deleted {trashDays} days after you move them here.
        </p>
        {PaginatedQueryResult.isExhausted(items) && count === 0 ? (
          <EmptyTrash />
        ) : (
          <TrashGrid items={items.results} />
        )}
        {more ? (
          <div className="mt-10 flex justify-center">
            <Button variant="secondary" size="lg" onClick={() => items.loadMore(60)}>
              Load more
            </Button>
          </div>
        ) : null}
      </main>
    </>
  );
}

function EmptyTrash() {
  return (
    <div className="grid justify-items-center py-28 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-sunken text-ink-3">
        <Icon icon={Delete02Icon} size={20} />
      </span>
      <p className="mt-4 text-[17px] leading-6 font-[600] tracking-[-0.016em]">
        The trash is empty.
      </p>
      <p className="mt-1 text-[14px] text-ink-2">
        Images you move to the trash wait here, so you can restore them.
      </p>
    </div>
  );
}

/** The trashed images at the library's tile size, each with its days left and Restore. */
function TrashGrid({ items }: { items: ReadonlyArray<Trashed> }) {
  const refIds = useMemo(() => items.map((item) => item.refId), [items]);
  const urls = useRefUrls(refIds, "thumbnail");
  return (
    <ul className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-3 gap-y-6">
      {items.map((item) => (
        <TrashCard key={item.refId} item={item} url={urls.get(item.refId)?.url} order={refIds} />
      ))}
    </ul>
  );
}

function TrashCard({
  item,
  url,
  order,
}: {
  item: Trashed;
  url: string | undefined;
  /** The trash's images in order, which the image's page steps through. */
  order: ReadonlyArray<Id<"refs">>;
}) {
  const restore = useMutation(refs.public.library.restore);
  const [loaded, setLoaded] = useState(false);
  const days = daysLeft(item.deletedAt, Date.now());
  const placeholder = useMemo(
    () =>
      item.thumbHash === null
        ? undefined
        : `url(${thumbHashToDataURL(Uint8Array.from(atob(item.thumbHash), (c) => c.charCodeAt(0)))})`,
    [item.thumbHash],
  );
  return (
    <li data-ref-id={item.refId} className="min-w-0">
      <Link
        to="/r/$refId"
        params={{ refId: item.refId }}
        onClick={() => rememberOpened(item.refId, { kind: "trash" }, order)}
        className="image-edge block aspect-[4/3] overflow-hidden rounded-[6px] bg-sunken"
      >
        <RetryingImg
          // Every image load is a CORS request, as in the gallery.
          crossOrigin="anonymous"
          src={url}
          alt={item.fileName}
          width={item.width}
          height={item.height}
          onLoad={() => setLoaded(true)}
          style={loaded ? undefined : { backgroundImage: placeholder, backgroundSize: "cover" }}
          className="size-full object-cover object-top"
        />
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-[18px] font-[520]">
            <ShownName fileName={item.fileName} />
          </p>
          <span className="block text-[12px] leading-4 text-ink-2 num">
            {days === 1 ? "1 day left" : `${days} days left`}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void restore({ refIds: [item.refId] })}
        >
          <Icon icon={ArrowTurnBackwardIcon} size={14} />
          Restore
        </Button>
      </div>
    </li>
  );
}
