import type { Ref } from "@confect/core";
import { QueryResult, useMutation, usePaginatedQuery, useQuery } from "@confect/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  FolderAddIcon,
  Link04Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { Id } from "@refhaven/backend/id";
import { FileName, Note, SourceUrl, TagName } from "@refhaven/backend/refFields";
import refs from "@refhaven/backend/refs";
import { trashDays } from "@refhaven/backend/trash";
import { Button, buttonVariants } from "@refhaven/ui/components/button";
import { chipVariants } from "@refhaven/ui/components/chip";
import { Icon } from "@refhaven/ui/components/icon";
import { fieldClass } from "@refhaven/ui/components/input";
import { Tooltip } from "@refhaven/ui/components/tooltip";
import { cn } from "@refhaven/ui/lib/utils";
import {
  ErrorComponent,
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Pile, shortCount, useCollectionCover } from "@/collections/pile";
import { CollectionPicker } from "@/library/gallery";
import { galleryPage } from "@/library/page";
import { ShownName } from "@/library/name";
import { type Origin, libraryOrigin, openedFrom, rememberOpened } from "@/library/origin";
import { useRefUrls } from "@/library/use-ref-urls";
import { NotFound } from "@/shell/not-found";
import { TopBar, pillClass } from "@/shell/top-bar";
import { RetryingImg } from "@/library/retrying-img";

export const Route = createFileRoute("/_app/r/$refId")({
  component: RefPage,
  // An ID from the URL that is not an image ID at all fails Convex's check of the arguments,
  // before `ref.get` can answer with its own "not found".
  errorComponent: ({ error }) =>
    error instanceof Error && error.message.includes("ArgumentValidationError") ? (
      <ImageNotFound />
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

function ImageNotFound() {
  return (
    <NotFound title="Image not found.">
      It may be in another account, or deleted for good after its {trashDays} days in the trash.
    </NotFound>
  );
}

type Steps = {
  readonly origin: Origin;
  readonly order: ReadonlyArray<Id<"refs">>;
  readonly previous: Id<"refs"> | undefined;
  readonly next: Id<"refs"> | undefined;
};

function useSteps(refId: Id<"refs">): Steps {
  const opened = openedFrom(refId);
  const library = usePaginatedQuery(refs.public.library.list, opened ? "skip" : {}, galleryPage);
  const order = opened?.order ?? library.results.map((item) => item.refId);
  const at = order.indexOf(refId);
  return {
    origin: opened?.origin ?? libraryOrigin,
    order,
    previous: at > 0 ? order[at - 1] : undefined,
    next: at >= 0 ? order[at + 1] : undefined,
  };
}

function RefPage() {
  const refId = Route.useParams().refId as Id<"refs">;
  const steps = useSteps(refId);
  const details = useQuery(refs.public.ref.get, { refId });
  const display = useDisplayCopies(refId, QueryResult.isSuccess(details), steps);
  useStepKeys(refId, steps);

  return QueryResult.match(details, {
    onLoading: () => <TopBar />,
    onFailure: () => <ImageNotFound />,
    onSuccess: (details) => (
      <RefDetails
        key={refId}
        refId={refId}
        details={details}
        display={display.get(refId)?.url}
        steps={steps}
      />
    ),
  });
}

/**
 * The display copies of the image and its neighbors, whose details and pixels load ahead of a
 * step. Nothing is signed until the page has found the image, so a missing or foreign one gets no
 * URL.
 */
function useDisplayCopies(refId: Id<"refs">, found: boolean, { previous, next }: Steps) {
  useQuery(refs.public.ref.get, previous ? { refId: previous } : "skip");
  useQuery(refs.public.ref.get, next ? { refId: next } : "skip");
  const signable = useMemo(
    () => (found ? [refId, ...(previous ? [previous] : []), ...(next ? [next] : [])] : []),
    [found, refId, previous, next],
  );
  const display = useRefUrls(signable, "display");
  usePreload(
    [previous, next].map((neighbor) => (neighbor ? display.get(neighbor)?.url : undefined)),
  );
  return display;
}

function usePreload(urls: ReadonlyArray<string | undefined>) {
  const key = urls.join(" ");
  useEffect(() => {
    for (const url of key.split(" ").filter(Boolean)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = url;
    }
  }, [key]);
}

function useStep(steps: Steps) {
  const navigate = useNavigate();
  return (refId: Id<"refs"> | undefined) => {
    if (!refId) return;
    rememberOpened(refId, steps.origin, steps.order);
    void navigate({ to: "/r/$refId", params: { refId }, replace: true });
  };
}

function useLeave(refId: Id<"refs">, origin: Origin) {
  const router = useRouter();
  const navigate = useNavigate();
  return () => {
    if (openedFrom(refId)) router.history.back();
    else void navigate(originLink(origin));
  };
}

const originLink = (origin: Origin) =>
  origin.kind === "collection"
    ? ({
        to: "/c/$collectionId",
        params: { collectionId: origin.collectionId },
        search: { view: "gallery" },
      } as const)
    : origin.kind === "trash"
      ? ({ to: "/trash" } as const)
      : ({ to: "/library" } as const);

function useStepKeys(refId: Id<"refs">, steps: Steps) {
  const step = useStep(steps);
  const leave = useLeave(refId, steps.origin);
  const keys = useRef({ step, leave, steps });
  keys.current = { step, leave, steps };
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox]",
        )
      ) {
        return;
      }
      const { step, leave, steps } = keys.current;
      if (event.key === "ArrowLeft") step(steps.previous);
      else if (event.key === "ArrowRight") step(steps.next);
      else if (event.key === "Escape") leave();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, []);
}

function Breadcrumb({ origin, fileName }: { origin: Origin; fileName: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(pillClass, "min-w-0 gap-0.5 pr-4 pl-1.5 narrow:hidden")}
    >
      <Link
        {...originLink(origin)}
        className="flex h-8 max-w-48 shrink-0 items-center truncate rounded-full px-3 font-[520] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        {origin.kind === "collection" ? origin.name : origin.kind === "trash" ? "Trash" : "Library"}
      </Link>
      <span aria-hidden className="px-0.5 text-ink-4">
        /
      </span>
      <span aria-current="page" className="max-w-[28vw] min-w-0 truncate pl-1.5 font-[580]">
        <ShownName fileName={fileName} />
      </span>
    </nav>
  );
}

function StepButton({ side, onClick }: { side: "previous" | "next"; onClick: () => void }) {
  const label = side === "previous" ? "Previous image" : "Next image";
  return (
    <Tooltip label={label} shortcut={side === "previous" ? "←" : "→"}>
      <Button
        variant="glass"
        size="icon-lg"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "absolute top-1/2 z-10 -translate-y-1/2",
          side === "previous" ? "-left-16 max-[900px]:left-3" : "-right-16 max-[900px]:right-3",
        )}
      >
        <Icon icon={side === "previous" ? ArrowLeft01Icon : ArrowRight01Icon} size={18} />
      </Button>
    </Tooltip>
  );
}

function RefDetails({
  refId,
  details,
  display,
  steps,
}: {
  refId: Id<"refs">;
  details: Details;
  display: string | undefined;
  steps: Steps;
}) {
  const refIds = useMemo(() => [refId], [refId]);
  const original = useRefUrls(refIds, "original").get(refId)?.url;
  const remove = useMutation(refs.public.library.remove);
  const restore = useMutation(refs.public.library.restore);
  const step = useStep(steps);
  const trashed = details.deletedAt !== null;

  return (
    <>
      <TopBar center={<Breadcrumb origin={steps.origin} fileName={details.fileName} />} />
      <main className="min-h-svh bg-canvas">
        <div className="fixed inset-y-0 right-[calc(408px+var(--gutter))] left-0 flex items-center justify-center px-16 pt-[84px] pb-7 max-[900px]:relative max-[900px]:px-gutter">
          <div className="relative flex max-w-full">
            <div className="image-edge flex max-w-full shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.25)]">
              <RetryingImg
                // Every image load is a CORS request, as in the gallery.
                crossOrigin="anonymous"
                src={display}
                alt={details.fileName}
                width={details.width}
                height={details.height}
                className="max-h-[calc(100svh-112px)] w-auto max-w-full object-contain"
              />
            </div>
            {steps.previous ? (
              <StepButton side="previous" onClick={() => step(steps.previous)} />
            ) : null}
            {steps.next ? <StepButton side="next" onClick={() => step(steps.next)} /> : null}
          </div>
        </div>
        <aside
          aria-label="Image details"
          className="fixed top-[68px] right-(--gutter) z-20 flex max-h-[calc(100svh-68px-var(--gutter))] w-[408px] flex-col overflow-hidden rounded-[24px] bg-surface shadow-float max-[900px]:static max-[900px]:mx-gutter max-[900px]:mb-gutter max-[900px]:max-h-none max-[900px]:w-auto"
        >
          {trashed ? (
            <div className="flex items-center gap-3 border-b border-line bg-sunken py-3 pr-3 pl-5">
              <Icon icon={Delete02Icon} size={16} className="shrink-0 text-ink-2" />
              <p className="flex-1 text-[14px] font-[520]">This image is in the trash.</p>
              <Button variant="secondary" size="sm" onClick={() => void restore({ refIds })}>
                <Icon icon={ArrowTurnBackwardIcon} size={16} />
                Restore
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pt-6 pb-2">
            <fieldset disabled={trashed} className="contents">
              <NameField refId={refId} fileName={details.fileName} />
              <NoteField refId={refId} note={details.note} />
              <SourceField refId={refId} sourceUrl={details.sourceUrl} />
              <Tags refId={refId} tags={details.tags} />
            </fieldset>
            <Section label="In collections">
              {details.collections.length === 0 ? (
                <p className="mb-1 text-[13px] text-ink-2">This image is in no collection yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {details.collections.map(({ collectionId, name }) => (
                    <CollectionRow key={collectionId} collectionId={collectionId} name={name} />
                  ))}
                </ul>
              )}
              {trashed ? null : (
                <CollectionPicker
                  refId={refId}
                  align="start"
                  trigger={
                    <button
                      type="button"
                      className="mt-1 flex h-9 w-full items-center gap-2 rounded-xl px-2.5 text-[14px] font-[520] text-ink-2 hover:bg-sunken hover:text-ink aria-expanded:bg-sunken"
                    >
                      <Icon icon={FolderAddIcon} size={16} className="text-ink-3" />
                      Add to a collection
                    </button>
                  }
                />
              )}
            </Section>
            <dl className="mt-6 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 border-t border-line pt-5 pb-4 text-[13px]">
              <dt className="text-ink-2">File</dt>
              <dd className="break-all">{details.fileName}</dd>
              <dt className="text-ink-2">Size</dt>
              <dd className="num">
                {details.width} × {details.height} px, {Math.ceil(details.byteSize / 1024)} KB
              </dd>
              <dt className="text-ink-2">Type</dt>
              <dd>{details.mimeType}</dd>
              <dt className="text-ink-2">Saved</dt>
              <dd className="num">
                {new Date(details.savedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </dd>
            </dl>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3.5">
            {original ? (
              <a
                href={original}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ variant: "secondary" })}
              >
                Open the original
                <Icon icon={ArrowUpRight01Icon} size={16} className="-mr-1 text-ink-2" />
              </a>
            ) : (
              <span />
            )}
            {trashed ? null : (
              <Button variant="ghost" onClick={() => void remove({ refIds })}>
                <Icon icon={Delete02Icon} size={16} />
                Move to trash
              </Button>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}

function Section({
  label,
  children,
  status,
}: {
  label: ReactNode;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex h-5 items-center justify-between text-[12px] font-[560] text-ink-2">
        {label}
        {status}
      </h2>
      {children}
    </section>
  );
}

function useSaveState() {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);
  return {
    done: (failure: string | null) => {
      setError(failure);
      setSaved(failure === null);
    },
    status: saved ? (
      <span className="flex items-center gap-1 font-[540] text-ok">
        <Icon icon={Tick02Icon} size={14} />
        Saved
      </span>
    ) : null,
    alert: error ? (
      <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-bad">
        <Icon icon={Alert02Icon} size={14} />
        {error}
      </p>
    ) : null,
  };
}

const saveButton = (label: string, visible: boolean) => (
  <Button
    type="submit"
    size="icon-sm"
    aria-label={label}
    className={cn("shrink-0", !visible && "hidden")}
  >
    <Icon icon={Tick02Icon} size={15} />
  </Button>
);

function NameField({ refId, fileName }: { refId: Id<"refs">; fileName: string }) {
  const update = useMutation(refs.public.ref.update);
  const [draft, setDraft] = useState<string | null>(null);
  const state = useSaveState();
  const close = () => {
    setDraft(null);
    state.done(null);
  };

  if (draft === null) {
    return (
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-[20px] leading-7 font-[620] tracking-[-0.022em] break-words">
          <ShownName fileName={fileName} />
        </h1>
        <Tooltip label="Rename">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rename"
            className="-mr-1.5 text-ink-3"
            onClick={() => setDraft(fileName)}
          >
            <Icon icon={PencilEdit02Icon} size={16} />
          </Button>
        </Tooltip>
      </div>
    );
  }
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const decoded = parseWith(FileName)(draft);
        if (Option.isNone(decoded)) {
          state.done("A name is 1 to 255 characters.");
          return;
        }
        const failure = failureTag(await update({ refId, fileName: decoded.value }));
        if (failure === null) close();
        else state.done(failure);
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          aria-label="Name"
          autoFocus
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            close();
          }}
          className={cn(fieldClass, "h-10 text-[16px] font-[560]")}
        />
        {saveButton("Save name", true)}
      </div>
      {state.alert}
    </form>
  );
}

/** A field's text, which follows a save from another page until the owner edits it here. */
function useDraft(saved: string) {
  const [value, setValue] = useState(saved);
  const last = useRef(saved);
  useEffect(() => {
    setValue((current) => (current === last.current ? saved : current));
    last.current = saved;
  }, [saved]);
  return [value, setValue] as const;
}

function NoteField({ refId, note }: { refId: Id<"refs">; note: string | null }) {
  const update = useMutation(refs.public.ref.update);
  const id = useId();
  const [value, setValue] = useDraft(note ?? "");
  const state = useSaveState();
  const dirty = value !== (note ?? "");
  const form = useRef<HTMLFormElement>(null);
  const save = async () => {
    const decoded = parseClearable(Note)(value);
    if (Option.isNone(decoded)) {
      state.done("A note is at most 10,000 characters.");
      return;
    }
    const failure = failureTag(await update({ refId, note: decoded.value }));
    state.done(failure);
    if (failure === null) setValue(decoded.value ?? "");
  };

  return (
    <Section label={<label htmlFor={id}>Note</label>} status={state.status}>
      <form
        ref={form}
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <textarea
          id={id}
          value={value}
          placeholder="What is it for? What to take from it?"
          onChange={(event) => setValue(event.currentTarget.value)}
          onBlur={(event) => {
            if (dirty && !form.current!.contains(event.relatedTarget)) void save();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            void save();
          }}
          className={cn(
            fieldClass,
            "field-sizing-content min-h-[88px] resize-none py-2.5 leading-[21px]",
            dirty && "pb-10",
          )}
        />
        <div className="absolute right-1.5 bottom-1.5">{saveButton("Save note", dirty)}</div>
      </form>
      {state.alert}
    </Section>
  );
}

const shownLink = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

function SourceField({ refId, sourceUrl }: { refId: Id<"refs">; sourceUrl: string | null }) {
  const update = useMutation(refs.public.ref.update);
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sourceUrl ?? "");
  const state = useSaveState();
  const showLink = sourceUrl !== null && !editing;

  return (
    <Section label={showLink ? "Source" : <label htmlFor={id}>Source</label>} status={state.status}>
      {showLink ? (
        <div className="flex h-10 items-center gap-2 rounded-xl bg-sunken pr-1 pl-3">
          <Icon icon={Link04Icon} size={16} className="shrink-0 text-ink-3" />
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="source"
            className="min-w-0 flex-1 truncate text-[14px] underline decoration-ink-4 underline-offset-[3px] hover:decoration-ink-2"
          >
            {shownLink(sourceUrl)}
          </a>
          <Tooltip label="Edit source">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit source"
              className="shrink-0 text-ink-3"
              onClick={() => {
                setDraft(sourceUrl);
                setEditing(true);
              }}
            >
              <Icon icon={PencilEdit02Icon} size={16} />
            </Button>
          </Tooltip>
        </div>
      ) : (
        <form
          className="flex items-center gap-1.5"
          onSubmit={async (event) => {
            event.preventDefault();
            const decoded = parseClearable(SourceUrl)(draft);
            if (Option.isNone(decoded)) {
              state.done("A source is an http or https link of at most 2,048 characters.");
              return;
            }
            const failure = failureTag(await update({ refId, sourceUrl: decoded.value }));
            state.done(failure);
            if (failure !== null) return;
            setEditing(false);
            if (decoded.value === null) setDraft("");
          }}
        >
          <input
            id={id}
            inputMode="url"
            placeholder="Paste a link"
            autoFocus={editing}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !editing) return;
              event.preventDefault();
              setEditing(false);
              state.done(null);
            }}
            className={cn(fieldClass, "h-10")}
          />
          {saveButton("Save source", editing || draft !== (sourceUrl ?? ""))}
        </form>
      )}
      {state.alert}
    </Section>
  );
}

function Tags({ refId, tags }: { refId: Id<"refs">; tags: ReadonlyArray<string> }) {
  const id = useId();
  const [name, setName] = useState("");
  const state = useSaveState();
  const known = useQuery(refs.public.ref.tags, {});
  const addTags = useMutation(refs.public.ref.addTags);
  const removeTags = useMutation(refs.public.ref.removeTags);

  return (
    <Section label="Tags" status={state.status}>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} data-tag={tag} className={cn(chipVariants(), "pr-1 pl-0")}>
            <Link
              to="/library"
              search={{ tag }}
              className="flex h-full items-center rounded-l-full pr-0.5 pl-[11px] hover:underline hover:decoration-ink-4 hover:underline-offset-[3px]"
            >
              {tag}
            </Link>
            <button
              type="button"
              aria-label={`Remove the tag ${tag}`}
              onClick={async () =>
                state.done(failureTag(await removeTags({ refId, names: [tag] })))
              }
              className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
            >
              <Icon icon={Cancel01Icon} size={12} />
            </button>
          </span>
        ))}
        <form
          className="flex items-center gap-1"
          onSubmit={async (event) => {
            event.preventDefault();
            const decoded = parseWith(TagName)(name);
            if (Option.isNone(decoded)) {
              state.done("A tag is 1 to 50 characters.");
              return;
            }
            const failure = failureTag(await addTags({ refId, names: [decoded.value] }));
            state.done(failure);
            if (failure === null) setName("");
          }}
        >
          <label className="flex h-7 items-center gap-1 rounded-full pr-1 pl-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--line-2)] focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1.5px_var(--ink)] has-[input:disabled]:opacity-50">
            <Icon icon={PlusSignIcon} size={12} />
            <input
              aria-label="Add a tag"
              list={`${id}-known`}
              placeholder="Add tag"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="min-w-[7ch] bg-transparent text-[13px] font-[500] text-ink outline-none [field-sizing:content] placeholder:text-ink-2"
            />
          </label>
          {name !== "" ? (
            <Button type="submit" size="sm" className="h-7 px-2.5">
              Add
            </Button>
          ) : null}
          <datalist id={`${id}-known`}>
            {(QueryResult.isSuccess(known) ? known.value : []).map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </form>
      </div>
      {state.alert}
    </Section>
  );
}

function CollectionRow({ collectionId, name }: { collectionId: Id<"collections">; name: string }) {
  const cover = useCollectionCover(collectionId);
  return (
    <li className="relative flex h-14 items-center gap-3 rounded-[14px] bg-sunken pr-3 pl-1 transition-colors hover:bg-hover">
      <Pile prints={cover.cover} scale={0.5} className="-my-2" />
      <Link
        to="/c/$collectionId"
        params={{ collectionId }}
        data-collection-id={collectionId}
        className="min-w-0 truncate text-[14px] font-[540] outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:outline-2 focus-visible:after:outline-ink"
      >
        {name}
      </Link>
      {cover.loaded ? (
        <span className="text-[14px] text-ink-3 num">{shortCount(cover)}</span>
      ) : null}
      <Icon icon={ArrowRight01Icon} size={16} className="ml-auto shrink-0 text-ink-3" />
    </li>
  );
}
