import { PaginatedQueryResult, QueryResult, usePaginatedQuery, useQuery } from "@confect/react";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useRefUrls } from "@/library/use-ref-urls";
import { type SaveOutcome, useSaveImage } from "@/library/use-save-image";

export const Route = createFileRoute("/_app/library")({ component: Library });

const pageSize = 60;

const outcomeText = (outcome: SaveOutcome) =>
  outcome.status === "rejected"
    ? `not saved (${outcome.reason})`
    : outcome.duplicate
      ? "saved. Your library already had this image, so its bytes were reused."
      : "saved.";

function Library() {
  const saveImage = useSaveImage();
  const [outcomes, setOutcomes] = useState<
    ReadonlyArray<{ fileName: string; outcome: SaveOutcome }>
  >([]);

  const items = usePaginatedQuery(refs.public.library.list, {}, { initialNumItems: pageSize });
  const refIds = useMemo(() => items.results.map((item) => item.refId), [items.results]);
  const urls = useRefUrls(refIds);

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-medium">Library</h1>

      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="images">Add images</Label>
        <Input
          id="images"
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => {
            const input = event.currentTarget;
            for (const file of Array.from(input.files ?? [])) {
              const outcome = await saveImage(file);
              setOutcomes((earlier) => [...earlier, { fileName: file.name, outcome }]);
            }
            input.value = "";
          }}
        />
      </div>
      <ul role="status">
        {outcomes.map(({ fileName, outcome }, index) => (
          <li key={index} data-outcome={outcome.status}>
            {fileName}: {outcomeText(outcome)}
          </li>
        ))}
      </ul>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {items.results.map((item) => (
          <li key={item.refId} data-ref-id={item.refId}>
            <img
              // Every image load is a CORS request. A response cached from a plain <img> has
              // no CORS headers, and a later canvas load of the same URL would fail on it.
              crossOrigin="anonymous"
              src={urls.get(item.refId)?.url}
              alt={item.fileName}
              width={item.width}
              height={item.height}
              className="h-auto w-full"
            />
            <p className="truncate">{item.fileName}</p>
          </li>
        ))}
      </ul>
      {PaginatedQueryResult.isLoading(items) ? <p>Loading…</p> : null}
      {PaginatedQueryResult.isFailure(items) ? <p role="alert">{items.error._tag}</p> : null}
      {PaginatedQueryResult.isExhausted(items) && items.results.length === 0 ? (
        <p>Nothing saved yet.</p>
      ) : null}
      {PaginatedQueryResult.isCanLoadMore(items) ? (
        <Button variant="outline" className="self-start" onClick={() => items.loadMore(pageSize)}>
          Load more
        </Button>
      ) : null}

      <Account />

      <h2 className="font-medium">Lab</h2>
      <ul>
        <li>
          <Link to="/lab/canvas-sync" search={{ mode: "live" }} className="underline">
            Canvas sync with 1,000 items
          </Link>
        </li>
        <li>
          <Link to="/lab/texture" className="underline">
            R2 image as a WebGL texture
          </Link>
        </li>
      </ul>
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
