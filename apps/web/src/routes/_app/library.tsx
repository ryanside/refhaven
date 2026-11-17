import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { NativeSelect, NativeSelectOption } from "@refhaven/ui/components/native-select";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as Result from "effect/Result";
import { CanvasView } from "@/canvas/canvas-view";
import { NameForm } from "@/collections/name-form";
import { Gallery, galleryPage } from "@/library/gallery";
import { ViewLinks, validateView } from "@/view";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateView,
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
  const items = usePaginatedQuery(refs.public.library.list, {}, galleryPage);
  const collections = useQuery(refs.public.collections.list, {});
  const create = useMutation(refs.public.collections.create);
  const addRefs = useMutation(refs.public.collections.addRefs);
  const owned = QueryResult.isSuccess(collections) ? collections.value : [];

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-medium">Library</h1>
      <ViewLinks />

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

      <Gallery
        items={items}
        action={(refId) =>
          owned.length === 0 ? null : (
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
          )
        }
      />

      <Account />
    </main>
  );
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
