import { getAuthUserId } from "@convex-dev/auth/server";
import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { components } from "./_generated/components";
import databaseSchema from "./_generated/schema";
import { DatabaseWriter, QueryCtx } from "./_generated/services";
import users, { NotSignedIn } from "./users.spec";

const createUser = FunctionImpl.make(databaseSchema, users, "createUser", () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("users").insert({});
  }).pipe(Effect.orDie),
);

const whoAmI = FunctionImpl.make(
  databaseSchema,
  users,
  "whoAmI",
  ({ greeting }) =>
    Effect.gen(function* () {
      const ctx = yield* QueryCtx;
      const userId = yield* Effect.promise(() => getAuthUserId(ctx));
      if (userId === null) {
        return yield* Effect.fail(new NotSignedIn());
      }
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
  GroupImpl.finalize,
);
