import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { components } from "./_generated/components";
import databaseSchema from "./_generated/schema";
import { DatabaseWriter, QueryCtx } from "./_generated/services";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import users from "./users.spec";

const createUser = FunctionImpl.make(databaseSchema, users, "createUser", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const userId = yield* writer.table("users").insert({});
    yield* writer.table("workspaces").insert({ ownerId: userId });
    return userId;
  }).pipe(Effect.orDie),
);

const whoAmI = FunctionImpl.make(databaseSchema, users, "whoAmI", ({ greeting }) =>
  Effect.gen(function* () {
    const { userId } = yield* CurrentWorkspace;
    const ctx = yield* QueryCtx;
    const username = yield* Effect.promise(() =>
      ctx.runQuery(components.authUsername.public.getUsername, { userId }),
    );
    return {
      userId,
      username,
      message: `${greeting}, ${username ?? "stranger"}`,
    };
  }),
);

export default GroupImpl.make(databaseSchema, users).pipe(
  Layer.provide(createUser),
  Layer.provide(whoAmI),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
