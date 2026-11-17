import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import refs from "./_generated/refs";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, Scheduler } from "./_generated/services";
import { writeSearchText } from "./ref";
import search from "./search.spec";

// Fills `searchText` on the Refs saved before it existed, across every workspace, 100 Refs a page.
// Each page schedules the next. A Ref that has the field is left alone, so a second run writes
// nothing.
const backfill = FunctionImpl.make(databaseSchema, search, "backfill", ({ cursor }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const { page, isDone, continueCursor } = yield* reader
      .table("refs")
      .index("by_creation_time")
      .paginate({ numItems: 100, cursor: cursor ?? null });
    const missing = page.filter((ref) => ref.searchText === undefined);
    yield* Effect.forEach(missing, (ref) => writeSearchText(ref._id), { discard: true });
    if (!isDone) {
      const scheduler = yield* Scheduler;
      yield* scheduler.runAfter(Duration.zero, refs.internal.search.backfill, {
        cursor: continueCursor,
      });
    }
    return { filled: missing.length, isDone };
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, search).pipe(
  Layer.provide(backfill),
  GroupImpl.finalize,
);
