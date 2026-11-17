import { PaginatedQueryResult } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { useRefUrls } from "@/library/use-ref-urls";
import { type SaveOutcome, useSaveImage } from "@/library/use-save-image";

type Item = {
  readonly refId: Id<"refs">;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly thumbHash: string | null;
};

const pageSize = 60;
export const galleryPage = { initialNumItems: pageSize };

const outcomeText = (outcome: SaveOutcome) =>
  outcome.status === "rejected"
    ? `not saved (${outcome.reason})`
    : outcome.duplicate
      ? "saved. Your library already had this image, so its bytes were reused."
      : "saved.";

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Saves picked, pasted, and dropped files into the library, and into the collection when one is
 * given. Paste and drop work anywhere on the page while this is shown.
 */
export function SaveImages({ collectionId }: { collectionId?: Id<"collections"> }) {
  const saveImage = useSaveImage(collectionId);
  const [outcomes, setOutcomes] = useState<
    ReadonlyArray<{ fileName: string; outcome: SaveOutcome }>
  >([]);

  const saveAll = useCallback(
    async (files: ReadonlyArray<File>) => {
      for (const file of files) {
        const outcome = await saveImage(file);
        setOutcomes((earlier) => [...earlier, { fileName: file.name, outcome }]);
      }
    },
    [saveImage],
  );

  useEffect(() => {
    // A browser refuses a drop unless `dragover` was cancelled, and then opens the file instead.
    const allowDrop = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const saveDropped = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      void saveAll(Array.from(event.dataTransfer!.files));
    };
    // A paste with no file is text for whichever field has focus.
    const savePasted = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void saveAll(files);
    };
    document.addEventListener("dragover", allowDrop);
    document.addEventListener("drop", saveDropped);
    document.addEventListener("paste", savePasted);
    return () => {
      document.removeEventListener("dragover", allowDrop);
      document.removeEventListener("drop", saveDropped);
      document.removeEventListener("paste", savePasted);
    };
  }, [saveAll]);

  return (
    <>
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="images">Add images</Label>
        <Input
          id="images"
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => {
            const input = event.currentTarget;
            await saveAll(Array.from(input.files ?? []));
            input.value = "";
          }}
        />
        <p>Or paste or drop images anywhere on this page.</p>
      </div>
      <ul role="status">
        {outcomes.map(({ fileName, outcome }, index) => (
          <li key={index} data-outcome={outcome.status}>
            {fileName}: {outcomeText(outcome)}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A set of Refs as a grid. `action` renders a control on each card. */
export function Gallery<E extends { readonly _tag: string }>({
  items,
  action,
  empty = "Nothing saved yet.",
}: {
  items: PaginatedQueryResult.PaginatedQueryResult<Item, E>;
  action: (refId: Id<"refs">) => ReactNode;
  empty?: string;
}) {
  const refIds = useMemo(() => items.results.map((item) => item.refId), [items.results]);
  const urls = useRefUrls(refIds, "thumbnail");

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {items.results.map((item) => (
          <li key={item.refId} data-ref-id={item.refId} className="flex flex-col gap-1">
            <Thumbnail item={item} url={urls.get(item.refId)?.url} />
            <p className="truncate">{item.fileName}</p>
            {action(item.refId)}
          </li>
        ))}
      </ul>
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
