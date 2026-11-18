import type { Ref } from "@confect/core";
import { QueryResult, useMutation, useQuery } from "@confect/react";
import type { Id } from "@refhaven/backend/id";
import { FileName, Note, SourceUrl, TagName } from "@refhaven/backend/refFields";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import { Textarea } from "@refhaven/ui/components/textarea";
import { ErrorComponent, Link, createFileRoute } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { useId, useMemo, useState } from "react";
import { useRefUrls } from "@/library/use-ref-urls";
import { PageHeader } from "@/page-header";

export const Route = createFileRoute("/_app/r/$refId")({
  component: RefPage,
  // An ID from the URL that is not an image ID at all fails Convex's check of the arguments,
  // before `ref.get` can answer with its own "not found".
  errorComponent: ({ error }) =>
    error instanceof Error && error.message.includes("ArgumentValidationError") ? (
      <NotFound />
    ) : (
      <ErrorComponent error={error} />
    ),
});

type Details = Ref.Returns<typeof refs.public.ref.get>;

const parseWith = (schema: Schema.Decoder<string>) => (raw: string) =>
  Schema.decodeUnknownOption(schema)(raw);

/** An empty field clears the value, which the server takes as null. */
const parseClearable =
  (schema: Schema.Decoder<string>) =>
  (raw: string): Option.Option<string | null> =>
    raw.trim() === "" ? Option.some(null) : parseWith(schema)(raw);

const failureTag = (result: Result.Result<unknown, { readonly _tag: string }>) =>
  Result.isFailure(result) ? result.failure._tag : null;

/** It keeps the title bar, which is the way to the sidebar. */
function NotFound() {
  return (
    <>
      <PageHeader title="Image" />
      <p className="p-6">Image not found.</p>
    </>
  );
}

function RefPage() {
  const refId = Route.useParams().refId as Id<"refs">;
  return QueryResult.match(useQuery(refs.public.ref.get, { refId }), {
    onLoading: () => (
      <>
        <PageHeader title="Image" />
        <p className="p-6">Loading…</p>
      </>
    ),
    onFailure: () => <NotFound />,
    onSuccess: (details) => <RefDetails key={refId} refId={refId} details={details} />,
  });
}

function RefDetails({ refId, details }: { refId: Id<"refs">; details: Details }) {
  const refIds = useMemo(() => [refId], [refId]);
  const display = useRefUrls(refIds, "display").get(refId)?.url;
  const original = useRefUrls(refIds, "original").get(refId)?.url;
  const update = useMutation(refs.public.ref.update);
  const remove = useMutation(refs.public.library.remove);
  const restore = useMutation(refs.public.library.restore);
  const trashed = details.deletedAt !== null;

  return (
    <>
      <PageHeader title={details.fileName} />
      <div className="flex flex-col gap-4 p-6">
        <img
          // Every image load is a CORS request, as in the gallery.
          crossOrigin="anonymous"
          src={display}
          alt={details.fileName}
          width={details.width}
          height={details.height}
          className="h-auto max-h-[70svh] w-auto max-w-full self-start object-contain"
        />
        {original ? (
          <a href={original} target="_blank" rel="noreferrer noopener" className="underline">
            Open the original
          </a>
        ) : null}
        <dl>
          <dt>Size</dt>
          <dd>
            {details.width} × {details.height} px, {Math.ceil(details.byteSize / 1024)} KB
          </dd>
          <dt>Type</dt>
          <dd>{details.mimeType}</dd>
          <dt>Saved</dt>
          <dd>{new Date(details.savedAt).toLocaleString()}</dd>
        </dl>

        {trashed ? (
          <>
            <p>This image is in the trash.</p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void restore({ refIds })}
            >
              Restore
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void remove({ refIds })}
          >
            Delete
          </Button>
        )}

        <fieldset disabled={trashed} className="flex flex-col gap-4">
          <FieldForm
            key={`name ${details.fileName}`}
            label="Name"
            initial={details.fileName}
            parse={parseWith(FileName)}
            refusal="A name is 1 to 255 characters."
            save={async (fileName) => failureTag(await update({ refId, fileName }))}
          />
          <FieldForm
            // JSON keeps an absent note apart from a note that reads "null".
            key={`note ${JSON.stringify(details.note)}`}
            label="Note"
            initial={details.note ?? ""}
            parse={parseClearable(Note)}
            multiline
            refusal="A note is at most 10,000 characters."
            save={async (note) => failureTag(await update({ refId, note }))}
          />
          <section className="flex flex-col gap-2">
            {details.sourceUrl ? (
              <a
                href={details.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
                data-testid="source"
              >
                {details.sourceUrl}
              </a>
            ) : null}
            <FieldForm
              key={`source ${JSON.stringify(details.sourceUrl)}`}
              label="Source"
              initial={details.sourceUrl ?? ""}
              parse={parseClearable(SourceUrl)}
              refusal="A source is an http or https link of at most 2,048 characters."
              save={async (sourceUrl) => failureTag(await update({ refId, sourceUrl }))}
            />
          </section>
          <Tags refId={refId} tags={details.tags} />
        </fieldset>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Collections</h2>
          {details.collections.length === 0 ? <p>This image is in no collection.</p> : null}
          <ul>
            {details.collections.map(({ collectionId, name }) => (
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
        </section>
      </div>
    </>
  );
}

/** One field of the image, saved on its own submit. `save` resolves to an error tag or null. */
function FieldForm<A>({
  label,
  initial,
  parse,
  refusal,
  multiline = false,
  save,
}: {
  label: string;
  initial: string;
  parse: (raw: string) => Option.Option<A>;
  refusal: string;
  multiline?: boolean;
  save: (value: A) => Promise<string | null>;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const Field = multiline ? Textarea : Input;

  return (
    <form
      className="flex max-w-xl flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const decoded = parse(value);
        setError(Option.isSome(decoded) ? await save(decoded.value) : refusal);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <Field id={id} value={value} onChange={(event) => setValue(event.currentTarget.value)} />
      <Button type="submit" variant="outline" size="sm" className="self-start">
        Save {label.toLowerCase()}
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

function Tags({ refId, tags }: { refId: Id<"refs">; tags: ReadonlyArray<string> }) {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const known = useQuery(refs.public.ref.tags, {});
  const addTags = useMutation(refs.public.ref.addTags);
  const removeTags = useMutation(refs.public.ref.removeTags);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Tags</h2>
      <ul className="flex flex-col gap-1">
        {tags.map((tag) => (
          <li key={tag} data-tag={tag} className="flex items-center gap-2">
            <Link to="/library" search={{ tag }} className="underline">
              {tag}
            </Link>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Remove the tag ${tag}`}
              onClick={async () => setError(failureTag(await removeTags({ refId, names: [tag] })))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex max-w-sm flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const decoded = parseWith(TagName)(name);
          if (Option.isNone(decoded)) {
            setError("A tag is 1 to 50 characters.");
            return;
          }
          const failure = failureTag(await addTags({ refId, names: [decoded.value] }));
          setError(failure);
          if (failure === null) setName("");
        }}
      >
        <Label htmlFor={id}>Add a tag</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            list={`${id}-known`}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Button type="submit">Add</Button>
        </div>
        <datalist id={`${id}-known`}>
          {(QueryResult.isSuccess(known) ? known.value : []).map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
