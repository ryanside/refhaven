import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseReader } from "./_generated/services";
import { generateUploadUrl, r2, syncMetadata } from "./images";
import images from "./images.spec";
import RequireUser from "./middleware/RequireUser.impl";
import { CurrentUser } from "./middleware/RequireUser.spec";

const list = FunctionImpl.make(databaseSchema, images, "list", () =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentUser;
    const reader = yield* DatabaseReader;
    const uploads = yield* reader
      .table("uploads")
      .index("by_user", (q) => q.eq("userId", userId))
      .collect();
    return yield* Effect.forEach(uploads, ({ key }) =>
      Effect.promise(() => r2.getUrl(key)).pipe(Effect.map((url) => ({ key, url }))),
    );
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, images).pipe(
  Layer.provide(FunctionImpl.make(databaseSchema, images, "generateUploadUrl", generateUploadUrl)),
  Layer.provide(FunctionImpl.make(databaseSchema, images, "syncMetadata", syncMetadata)),
  Layer.provide(list),
  Layer.provide(RequireUser),
  GroupImpl.finalize,
);
