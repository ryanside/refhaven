import { PaginatedQueryResult, useMutation, usePaginatedQuery } from "@confect/react";
import { ArrowTurnBackwardIcon, Clock01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { daysLeft, trashDays } from "@refhaven/backend/trash";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { galleryPage } from "@/library/gallery";
import { useRefUrls } from "@/library/use-ref-urls";
import { TopBar } from "@/shell/top-bar";

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
        <h1 className="flex items-baseline gap-2.5 text-[28px] leading-[34px] font-[620] tracking-[-0.03em]">
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
          Images here are deleted for good {trashDays} days after you delete them.
        </p>
        {PaginatedQueryResult.isExhausted(items) && count === 0 ? (
          <EmptyTrash />
        ) : (
          <JustifiedRows items={items.results} />
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

const gap = 12;
const targetHeight = 300;

/**
 * The images in rows, each at its own aspect ratio, each full row exactly as wide as the page. The
 * last row keeps the target height rather than stretching a few images across the page.
 */
function JustifiedRows({ items }: { items: ReadonlyArray<Trashed> }) {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const target = element.current!;
    setWidth(target.clientWidth);
    const resize = new ResizeObserver(() => setWidth(target.clientWidth));
    resize.observe(target);
    return () => resize.disconnect();
  }, []);
  const refIds = useMemo(() => items.map((item) => item.refId), [items]);
  const urls = useRefUrls(refIds, "thumbnail");

  const rows: Array<{ height: number; items: Array<Trashed> }> = [];
  let row: Array<Trashed> = [];
  let ratios = 0;
  for (const item of items) {
    row.push(item);
    ratios += item.width / item.height;
    const fitted = (width - gap * (row.length - 1)) / ratios;
    if (fitted <= targetHeight) {
      rows.push({ height: fitted, items: row });
      row = [];
      ratios = 0;
    }
  }
  if (row.length > 0) {
    const fitted = (width - gap * (row.length - 1)) / ratios;
    rows.push({ height: Math.min(targetHeight * 1.25, fitted), items: row });
  }

  return (
    <div ref={element} className="mt-7 flex flex-col gap-4">
      {width === 0
        ? null
        : rows.map((line, index) => (
            <ul key={index} className="flex gap-3">
              {line.items.map((item) => (
                <TrashCard
                  key={item.refId}
                  item={item}
                  url={urls.get(item.refId)?.url}
                  width={(line.height * item.width) / item.height}
                  height={line.height}
                />
              ))}
            </ul>
          ))}
    </div>
  );
}

function TrashCard({
  item,
  url,
  width,
  height,
}: {
  item: Trashed;
  url: string | undefined;
  width: number;
  height: number;
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
    <li data-ref-id={item.refId} className="shrink-0" style={{ width }}>
      <Link
        to="/r/$refId"
        params={{ refId: item.refId }}
        className="relative block overflow-hidden rounded-[6px] bg-sunken"
        style={{ height }}
      >
        <img
          // Every image load is a CORS request, as in the gallery.
          crossOrigin="anonymous"
          src={url}
          alt={item.fileName}
          width={item.width}
          height={item.height}
          onLoad={() => setLoaded(true)}
          style={loaded ? undefined : { backgroundImage: placeholder, backgroundSize: "100% 100%" }}
          className="size-full object-cover"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_var(--edge)]"
        />
      </Link>
      <div className="flex items-center gap-3 pt-2.5 pl-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-[540]">{item.fileName}</p>
          <span className="block text-[13px] text-ink-2 num">
            {days === 1 ? "1 day left" : `${days} days left`}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void restore({ refIds: [item.refId] })}
        >
          <Icon icon={ArrowTurnBackwardIcon} size={16} />
          Restore
        </Button>
      </div>
    </li>
  );
}
