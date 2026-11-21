import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, galleryPage } from "@/library/gallery";
import { AddImagesButton, SaveScope } from "@/library/save-images";
import { TopBar, pillClass } from "@/shell/top-bar";
import { ViewLinks, validateCollectionSearch } from "@/view";

export const Route = createFileRoute("/_app/c/$collectionId")({
  validateSearch: validateCollectionSearch,
  component: CollectionPage,
});

function CollectionPage() {
  const collectionId = Route.useParams().collectionId as Id<"collections">;
  const collections = useQuery(refs.public.collections.list, {});

  if (!QueryResult.isSuccess(collections)) {
    return <Outside title="Collection">Loading…</Outside>;
  }
  const collection = collections.value.find((owned) => owned.collectionId === collectionId);
  if (!collection) {
    return <Outside title="Collection">Collection not found.</Outside>;
  }
  return <Collection key={collectionId} collectionId={collectionId} name={collection.name} />;
}

/** A page with no collection to show. It keeps the top bar, which is the way to every page. */
function Outside({ children }: { title: string; children: string }) {
  return (
    <>
      <TopBar />
      <main className="px-gutter pt-[84px]">{children}</main>
    </>
  );
}

function Collection({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const { view = "canvas" } = Route.useSearch();
  const title = (
    <div className={pillClass}>
      <h1 className="max-w-[28vw] truncate px-3 font-[600] tracking-[-0.012em]">{name}</h1>
      <ViewLinks />
    </div>
  );
  return view === "gallery" ? (
    <SaveScope target={{ collectionId, name }}>
      <TopBar center={title} action={<AddImagesButton />} />
      <CollectionGallery collectionId={collectionId} name={name} />
    </SaveScope>
  ) : (
    <>
      <TopBar center={title} />
      <CanvasView collectionId={collectionId} name={name} />
    </>
  );
}

function CollectionGallery({
  collectionId,
  name,
}: {
  collectionId: Id<"collections">;
  name: string;
}) {
  const { view: _, ...filters } = Route.useSearch();
  const rename = useMutation(refs.public.collections.rename);
  const removeRefs = useMutation(refs.public.collections.removeRefs);
  const action: CardAction = (refId) => (
    <Button
      variant="secondary"
      size="sm"
      className="self-start"
      onClick={() => void removeRefs({ collectionId, refIds: [refId] })}
    >
      Remove from collection
    </Button>
  );

  return (
    <main className="flex flex-col gap-4 px-gutter pt-[84px] pb-16">
      <NameForm
        label="Collection name"
        submit="Rename"
        initialName={name}
        save={async (newName) => {
          const renamed = await rename({ collectionId, name: newName });
          return Result.isFailure(renamed) ? renamed.failure._tag : null;
        }}
      />
      <GalleryFilters {...filters} />
      {isFiltered(filters) ? (
        <FilteredGallery filters={filters} collectionId={collectionId} action={action} />
      ) : (
        <Members collectionId={collectionId} action={action} />
      )}
    </main>
  );
}

function Members({
  collectionId,
  action,
}: {
  collectionId: Id<"collections">;
  action: CardAction;
}) {
  const items = usePaginatedQuery(refs.public.collections.refs, { collectionId }, galleryPage);
  return <Gallery items={items} action={action} />;
}
