import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseReader } from "./_generated/services";
import { r2, syncMetadata, uploadKeyPrefix } from "./images";
import images from "./images.spec";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";

const generateUploadUrl = FunctionImpl.make(databaseSchema, images, "generateUploadUrl", () =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentWorkspace;
    const key = `${uploadKeyPrefix(userId)}${crypto.randomUUID()}`;
    return yield* Effect.promise(() => r2.generateUploadUrl(key));
  }),
);

const list = FunctionImpl.make(databaseSchema, images, "list", () =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentWorkspace;
    const reader = yield* DatabaseReader;
    const uploads = yield* reader
      .table("uploads")
      .index("by_user_and_key", (q) => q.eq("userId", userId))
      .collect();
    return yield* Effect.forEach(uploads, ({ key }) =>
      Effect.promise(() => r2.getUrl(key)).pipe(Effect.map((url) => ({ key, url }))),
    );
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, images).pipe(
  Layer.provide(generateUploadUrl),
  Layer.provide(FunctionImpl.make(databaseSchema, images, "syncMetadata", syncMetadata)),
  Layer.provide(list),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
