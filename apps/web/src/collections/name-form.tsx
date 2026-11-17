import { CollectionName } from "@refhaven/backend/collection";
import { Button } from "@refhaven/ui/components/button";
import { Input } from "@refhaven/ui/components/input";
import { Label } from "@refhaven/ui/components/label";
import * as Schema from "effect/Schema";
import { useId, useState } from "react";

const isName = Schema.is(CollectionName);

/** A collection's name, trimmed before it is sent. `save` resolves to an error tag or null. */
export function NameForm({
  label,
  submit,
  initialName = "",
  save,
}: {
  label: string;
  submit: string;
  initialName?: string;
  save: (name: string) => Promise<string | null>;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  return (
    <form
      className="flex max-w-sm flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const failure = await save(trimmed);
        setError(failure);
        if (failure === null) setName(initialName === "" ? "" : trimmed);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <Button type="submit" disabled={!isName(trimmed)}>
          {submit}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
