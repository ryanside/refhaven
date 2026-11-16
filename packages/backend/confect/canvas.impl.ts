import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CanvasItemsDoc } from "./_generated/docs";
import type { Id } from "./_generated/id";
import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import canvas, { CanvasNotFound } from "./canvas.spec";
import RequireUser from "./middleware/RequireUser.impl";
import { CurrentUser } from "./middleware/RequireUser.spec";

const ownedCanvas = (canvasId: Id<"canvases">) =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentUser;
    const reader = yield* DatabaseReader;
    const found = yield* reader
      .table("canvases")
      .get(canvasId)
      .pipe(Effect.mapError(() => new CanvasNotFound()));
    if (found.userId !== userId) {
      return yield* new CanvasNotFound();
    }
    return found;
  });

const toItem = ({ _id, _creationTime, canvasId, rev, ...item }: CanvasItemsDoc) => item;

const seed = FunctionImpl.make(databaseSchema, canvas, "seed", ({ count }) =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentUser;
    const writer = yield* DatabaseWriter;
    const canvasId = yield* writer.table("canvases").insert({ userId, rev: 0 });
    yield* Effect.forEach(
      Array.from({ length: count }, (_, index) => index),
      (index) =>
        writer.table("canvasItems").insert({
          canvasId,
          rev: 0,
          key: `k${index.toString(36).padStart(20, "0")}`,
          kind: "image",
          refId: `r${index.toString(36).padStart(31, "0")}`,
          x: (index % 40) * 260 + Math.random() * 20,
          y: Math.floor(index / 40) * 260 + Math.random() * 20,
          scale: 0.5 + Math.random(),
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
          grayscale: false,
          z: `a${index.toString(36).padStart(3, "0")}`,
        }),
      { discard: true },
    );
    return canvasId;
  }).pipe(Effect.orDie),
);

const items = FunctionImpl.make(databaseSchema, canvas, "items", ({ canvasId }) =>
  Effect.gen(function* () {
    yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const docs = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_key", (q) => q.eq("canvasId", canvasId))
      .collect()
      .pipe(Effect.orDie);
    return docs.map(toItem);
  }),
);

const itemsSince = FunctionImpl.make(databaseSchema, canvas, "itemsSince", ({ canvasId, rev }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const docs = yield* reader
      .table("canvasItems")
      .index("by_canvas_and_rev", (q) => q.eq("canvasId", canvasId).gt("rev", rev))
      .collect()
      .pipe(Effect.orDie);
    return { rev: found.rev, items: docs.map(toItem) };
  }),
);

const moveItems = FunctionImpl.make(databaseSchema, canvas, "moveItems", ({ canvasId, moves }) =>
  Effect.gen(function* () {
    const found = yield* ownedCanvas(canvasId);
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const rev = found.rev + 1;
    yield* writer.table("canvases").patch(canvasId, { rev }).pipe(Effect.orDie);
    yield* Effect.forEach(
      moves,
      ({ key, x, y }) =>
        reader
          .table("canvasItems")
          .get("by_canvas_and_key", canvasId, key)
          .pipe(
            Effect.flatMap((item) => writer.table("canvasItems").patch(item._id, { x, y, rev })),
            Effect.orDie,
          ),
      { discard: true },
    );
    return rev;
  }),
);

export default GroupImpl.make(databaseSchema, canvas).pipe(
  Layer.provide(seed),
  Layer.provide(items),
  Layer.provide(itemsSince),
  Layer.provide(moveItems),
  Layer.provide(RequireUser),
  GroupImpl.finalize,
);
