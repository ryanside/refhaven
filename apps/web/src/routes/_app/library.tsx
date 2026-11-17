import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { FilteredGallery, GalleryFilters, isFiltered } from "@/library/filters";
import { type CardAction, Gallery, galleryPage } from "@/library/gallery";
import { SaveImages } from "@/library/save-images";
import { ViewLinks, validateGallerySearch } from "@/view";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateGallerySearch,
  component: Library,
});

function Library() {
  const { view = "gallery" } = Route.useSearch();
  return view === "canvas" ? (
    <CanvasView>
      <ViewLinks />
    </CanvasView>
  ) : (
    <LibraryGallery />
  );
}

function LibraryGallery() {
  const { view: _, ...filters } = Route.useSearch();
  const collections = useQuery(refs.public.collections.list, {});
  const create = useMutation(refs.public.collections.create);
  const addRefs = useMutation(refs.public.collections.addRefs);
  const remove = useMutation(refs.public.library.remove);
  const owned = QueryResult.isSuccess(collections) ? collections.value : [];
  const action: CardAction = (refId) => (
    <>
      {owned.length === 0 ? null : (
        <NativeSelect
          aria-label="Add to collection"
          value=""
          onChange={(event) =>
            void addRefs({
              collectionId: event.currentTarget.value as Id<"collections">,
              refIds: [refId],
            })
          }
        >
          <NativeSelectOption value="" disabled>
            Add to collection
          </NativeSelectOption>
          {owned.map(({ collectionId, name }) => (
            <NativeSelectOption key={collectionId} value={collectionId}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void remove({ refIds: [refId] })}
      >
        Delete
      </Button>
    </>
  );

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-medium">Library</h1>
      <ViewLinks />
      <Link to="/trash" className="underline">
        Trash
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Collections</h2>
        <ul>
          {owned.map(({ collectionId, name }) => (
            <li key={collectionId}>
              <Link
                to="/c/$collectionId"
                params={{ collectionId }}
                data-collection-id={collectionId}
                className="underline"
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
        <NameForm
          label="New collection"
          submit="Create"
          save={async (name) => {
            const created = await create({ name });
            return Result.isFailure(created) ? created.failure._tag : null;
          }}
        />
      </section>

      <SaveImages />
      <GalleryFilters {...filters} />
      {isFiltered(filters) ? (
        <FilteredGallery filters={filters} action={action} />
      ) : (
        <WholeLibrary action={action} />
      )}

      <Account />
    </main>
  );
}

function WholeLibrary({ action }: { action: CardAction }) {
  const items = usePaginatedQuery(refs.public.library.list, {}, galleryPage);
  return <Gallery items={items} action={action} />;
}

function Account() {
  const me = useQuery(refs.public.users.whoAmI, { greeting: "Hello" });

  return (
    <section>
      <h2 className="font-medium">Account</h2>
      {QueryResult.match(me, {
        onLoading: () => <p>Loading…</p>,
        onFailure: (error) => <p role="alert">{error._tag}</p>,
        onSuccess: ({ message, userId, username }) => (
          <dl>
            <dt>Message</dt>
            <dd data-testid="message">{message}</dd>
            <dt>Username</dt>
            <dd data-testid="username">{username}</dd>
            <dt>User ID</dt>
            <dd data-testid="user-id">{userId}</dd>
          </dl>
        ),
      })}
    </section>
  );
}
