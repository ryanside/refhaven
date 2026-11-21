import { useMutation } from "@confect/react";
import { CollectionName } from "@refhaven/backend/collection";
import type { Id } from "@refhaven/backend/id";
import refs from "@refhaven/backend/refs";
import { Button } from "@refhaven/ui/components/button";
import { cn } from "@refhaven/ui/lib/utils";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { useState } from "react";

export const isCollectionName = Schema.is(CollectionName);

export const newCollectionButtonClass =
  "flex h-10 w-full items-center gap-2.5 rounded-[11px] px-2.5 text-[14px] font-[520] text-ink-2 -outline-offset-2 hover:bg-hover hover:text-ink";

export const nameRefusal = (tag: string) =>
  tag === "SchemaError" || tag === "InvalidName"
    ? "A name is 1 to 100 characters."
    : `That name was refused (${tag}).`;

/**
 * A field that names a new collection, with Create once it holds a name. The name is trimmed
 * before it is sent. `created` hears the new collection's ID.
 */
export function NewCollectionForm({
  label = "New collection",
  className,
  fieldClassName,
  note,
  noteClassName,
  autoFocus,
  created,
  cancel,
}: {
  label?: string;
  className?: string;
  fieldClassName?: string;
  /** A line under the field, which a refused name's reason takes the place of. */
  note?: string;
  noteClassName?: string;
  autoFocus?: boolean;
  created?: (collectionId: Id<"collections">) => void;
  cancel?: () => void;
}) {
  const create = useMutation(refs.public.collections.create);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  return (
    <form
      className={cn("flex min-w-0 flex-col gap-1", className)}
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await create({ name: trimmed });
        if (Result.isFailure(result)) {
          setError(nameRefusal(result.failure._tag));
          return;
        }
        setError(null);
        setName("");
        created?.(result.success);
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          aria-label={label}
          placeholder="New collection"
          value={name}
          autoFocus={autoFocus}
          maxLength={200}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !cancel) return;
            event.preventDefault();
            cancel();
          }}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-full bg-transparent px-3 text-[14px] font-[520] text-ink outline-none placeholder:font-[520] placeholder:text-ink-2 focus:bg-sunken focus:shadow-[inset_0_0_0_1.5px_var(--ink)]",
            fieldClassName,
          )}
        />
        {name !== "" ? (
          <Button type="submit" size="sm" disabled={!isCollectionName(trimmed)}>
            Create
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-3 text-[12px] text-bad">
          {error}
        </p>
      ) : note ? (
        <p className={cn("px-3", noteClassName)}>{note}</p>
      ) : null}
    </form>
  );
}
