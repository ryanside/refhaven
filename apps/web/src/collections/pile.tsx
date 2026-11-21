import { PaginatedQueryResult, usePaginatedQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { cn } from "@refhaven/ui/lib/utils";
import { useMemo } from "react";
import { useRefUrls } from "@/library/use-ref-urls";
import { RetryingImg } from "@/library/retrying-img";

type Print = {
  readonly refId: Id<"refs">;
  readonly width: number;
  readonly height: number;
};

/** How many of a collection's images a shelf or a menu counts before it says "60+". */
const counted = 60;

/**
 * A collection's newest images for its pile, and how many it holds. The query is the first page of
 * the collection's gallery, so opening the gallery reuses it.
 */
export function useCollectionCover(collectionId: Id<"collections">) {
  const items = usePaginatedQuery(
    refs.public.collections.refs,
    { collectionId },
    { initialNumItems: counted },
  );
  return {
    cover: items.results.slice(0, 3),
    count: items.results.length,
    more: PaginatedQueryResult.isCanLoadMore(items) || PaginatedQueryResult.isLoadingMore(items),
    loaded: !PaginatedQueryResult.isLoadingFirstPage(items),
  };
}

/** "7 images", or "60+ images" past what was counted. */
export const countLabel = ({ count, more }: { count: number; more: boolean }) =>
  more ? `${count}+ images` : count === 1 ? "1 image" : `${count} images`;

export const shortCount = ({ count, more }: { count: number; more: boolean }) =>
  more ? `${count}+` : `${count}`;

// Three prints fanned like photos on a table: the newest in front and upright.
const poses = [
  { x: 0, y: 0, r: 0, big: true },
  { x: -25, y: 3, r: -9, big: false },
  { x: 25, y: 1, r: 7, big: false },
] as const;

/**
 * Up to three of a collection's images, uncropped, fanned like prints. `scale` 1 is the shelf's
 * size, 108 by 76 pixels. An empty collection is one dashed print.
 */
export function Pile({
  prints,
  scale = 1,
  className,
}: {
  prints: ReadonlyArray<Print>;
  scale?: number;
  className?: string;
}) {
  const refIds = useMemo(() => prints.map(({ refId }) => refId), [prints]);
  const urls = useRefUrls(refIds, "thumbnail");
  const box = 58 * scale;
  return (
    <div
      aria-hidden
      className={cn("relative shrink-0", className)}
      style={{ width: 108 * scale, height: 76 * scale }}
    >
      {prints.length === 0 ? (
        <div
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-[3px] border-[1.5px] border-dashed border-ink-4"
          style={{ width: box * 0.78, height: box }}
        />
      ) : (
        prints
          .map((print, index) => ({ print, pose: poses[index]! }))
          .reverse()
          .map(({ print, pose }) => {
            const edge = (pose.big ? box + 10 * scale : box) / Math.max(print.width, print.height);
            return (
              <RetryingImg
                key={print.refId}
                // Every image load is a CORS request, as in the gallery.
                crossOrigin="anonymous"
                src={urls.get(print.refId)?.url}
                alt=""
                className="absolute top-1/2 left-1/2 max-w-none rounded-[2px] bg-sunken shadow-print"
                style={{
                  width: print.width * edge,
                  height: print.height * edge,
                  transform: `translate(-50%, -50%) translate(${pose.x * scale}px, ${pose.y * scale}px) rotate(${pose.r}deg)`,
                }}
              />
            );
          })
      )}
    </div>
  );
}
