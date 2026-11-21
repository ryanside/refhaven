import { PaginatedQueryResult, QueryResult, useMutation, useQuery } from "@confect/react";
import { FolderRemoveIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Icon } from "@refhaven/ui/components/icon";
import { Tooltip } from "@refhaven/ui/components/tooltip";
import { cn } from "@refhaven/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { useState } from "react";
import { CanvasView } from "@/canvas/canvas-view";
import { isCollectionName, nameRefusal } from "@/collections/new-collection";
import { shortCount, useCollectionCover, useCollectionMembers } from "@/collections/pile";
import { EmptyDropZone, PasteKeys } from "@/library/empty";
import {
  ClearFilters,
  FilteredGallery,
  SearchField,
  TagChips,
  isFiltered,
  matchCount,
  useFiltered,
} from "@/library/filters";
import { Gallery, type Removal } from "@/library/gallery";
import { OriginContext } from "@/library/origin";
import { AddImagesButton, SaveScope } from "@/library/save-images";
import { NotFound } from "@/shell/not-found";
import { toast } from "@/shell/toast";
import { Rule, TopBar, pillClass } from "@/shell/top-bar";
import { type Filters, ViewLinks, validateCollectionSearch } from "@/view";

export const Route = createFileRoute("/_app/c/$collectionId")({
  validateSearch: validateCollectionSearch,
  component: CollectionPage,
});

function CollectionPage() {
  const collectionId = Route.useParams().collectionId as Id<"collections">;
  const collections = useQuery(refs.public.collections.list, {});

  if (!QueryResult.isSuccess(collections)) return <TopBar />;
  const collection = collections.value.find((owned) => owned.collectionId === collectionId);
  if (!collection) {
    return (
      <NotFound title="Collection not found.">
        It may have been made by another account, or the link is incomplete.
      </NotFound>
    );
  }
  return <Collection key={collectionId} collectionId={collectionId} name={collection.name} />;
}

function Collection({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const { view = "canvas" } = Route.useSearch();
  const title = <CollectionTitle collectionId={collectionId} name={name} />;
  return view === "gallery" ? (
    <CollectionGallery collectionId={collectionId} name={name} title={title} />
  ) : (
    <CanvasView collectionId={collectionId} name={name} title={title} />
  );
}

function CollectionTitle({
  collectionId,
  name,
}: {
  collectionId: Id<"collections">;
  name: string;
}) {
  const rename = useMutation(refs.public.collections.rename);
  const cover = useCollectionCover(collectionId);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed === name || trimmed === "") {
      setDraft(null);
      setError(null);
      return;
    }
    if (!isCollectionName(trimmed)) {
      setError("A name is 1 to 100 characters.");
      return;
    }
    const renamed = await rename({ collectionId, name: trimmed });
    if (Result.isFailure(renamed)) {
      setError(nameRefusal(renamed.failure._tag));
      return;
    }
    setDraft(null);
    setError(null);
  };

  return (
    <div className="relative min-w-0">
      <div className={cn(pillClass, "shrink")}>
        {draft === null ? (
          <div className="flex min-w-0 items-center gap-2 pr-0.5 pl-3">
            <h1 className="max-w-[24vw] truncate font-[600] tracking-[-0.012em]">{name}</h1>
            {cover.loaded ? <span className="text-ink-3 num">{shortCount(cover)}</span> : null}
            <Tooltip label="Rename">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Rename"
                className="text-ink-3"
                onClick={() => setDraft(name)}
              >
                <Icon icon={PencilEdit02Icon} size={15} />
              </Button>
            </Tooltip>
          </div>
        ) : (
          <input
            aria-label="Collection name"
            autoFocus
            value={draft}
            maxLength={200}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
                setError(null);
              }
            }}
            className="h-8 max-w-[28vw] min-w-40 rounded-full bg-sunken px-3 font-[600] tracking-[-0.012em] outline-none [field-sizing:content] focus:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          />
        )}
        <Rule />
        <ViewLinks />
      </div>
      {error ? (
        <p
          role="alert"
          className="absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-full bg-surface px-3 py-1.5 text-[12px] whitespace-nowrap text-bad shadow-float"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CollectionGallery({
  collectionId,
  name,
  title,
}: {
  collectionId: Id<"collections">;
  name: string;
  title: React.ReactNode;
}) {
  const { view: _, ...filters } = Route.useSearch();
  const members = useCollectionMembers(collectionId);
  const empty =
    !isFiltered(filters) &&
    PaginatedQueryResult.isExhausted(members) &&
    members.results.length === 0;
  const removal = useRemoveFromCollection(collectionId, name);

  return (
    <SaveScope target={{ collectionId, name }}>
      <TopBar center={title} action={empty ? null : <AddImagesButton fold />} />
      {empty ? (
        <EmptyDropZone title="Nothing in this collection yet.">
          Drop images anywhere on this page, paste them with <PasteKeys />, or pick files. They go
          into your library too, or add images from the{" "}
          <Link
            to="/library"
            className="text-ink underline decoration-ink-4 underline-offset-[3px]"
          >
            Library
          </Link>
          .
        </EmptyDropZone>
      ) : (
        <main className="px-gutter pt-[84px] pb-28 narrow:pt-[132px]">
          <OriginContext value={{ kind: "collection", collectionId, name }}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
              <SearchField filters={filters} variant="inline" />
              <div className="min-w-0 flex-1">
                <TagChips filters={filters} />
              </div>
            </div>
            {isFiltered(filters) ? (
              <Filtered filters={filters} collectionId={collectionId} removal={removal} />
            ) : (
              <div className="mt-5">
                <Gallery items={members} removal={removal} />
              </div>
            )}
          </OriginContext>
        </main>
      )}
    </SaveScope>
  );
}

function Filtered({
  filters,
  collectionId,
  removal,
}: {
  filters: Filters;
  collectionId: Id<"collections">;
  removal: Removal;
}) {
  const result = useFiltered(filters, collectionId);
  const count = matchCount(result);
  return (
    <>
      <div className="mt-4 mb-4 flex min-h-7 items-center gap-3">
        {count ? <span className="text-[14px] text-ink-2 num">{count}</span> : null}
        <ClearFilters />
      </div>
      <FilteredGallery result={result} removal={removal} />
    </>
  );
}

function useRemoveFromCollection(collectionId: Id<"collections">, name: string): Removal {
  const removeRefs = useMutation(refs.public.collections.removeRefs);
  const addRefs = useMutation(refs.public.collections.addRefs);
  return {
    label: "Remove from collection",
    icon: FolderRemoveIcon,
    run: (refId) => {
      void removeRefs({ collectionId, refIds: [refId] });
      toast(`Removed from ${name}`, {
        label: "Undo",
        run: () => void addRefs({ collectionId, refIds: [refId] }),
      });
    },
  };
}
