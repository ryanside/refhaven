import { getAuthUserId } from "@convex-dev/auth/server";
import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import refs from "../_generated/refs";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, MutationCtx, QueryCtx, QueryRunner } from "../_generated/services";
import RequireWorkspace, { CurrentWorkspace, NotSignedIn } from "./RequireWorkspace.spec";

const personalWorkspace = (ctx: Parameters<typeof getAuthUserId>[0]) =>
  Effect.gen(function* () {
    const userId = yield* Effect.promise(() => getAuthUserId(ctx));
    if (userId === null) {
      return yield* new NotSignedIn();
    }
    const reader = yield* DatabaseReader;
    const workspace = yield* reader.table("workspaces").get("by_owner", userId).pipe(Effect.orDie);
    return { userId, workspaceId: workspace._id };
  });

export default MiddlewareImpl.makeByFunctionType(databaseSchema, RequireWorkspace, {
  query: (effect) =>
    Effect.provideServiceEffect(
      effect,
      CurrentWorkspace,
      Effect.gen(function* () {
        return yield* personalWorkspace(yield* QueryCtx);
      }),
    ),
  mutation: (effect) =>
    Effect.provideServiceEffect(
      effect,
      CurrentWorkspace,
      Effect.gen(function* () {
        return yield* personalWorkspace(yield* MutationCtx);
      }),
    ),
  // An action has no database, so it asks a query, which runs as the same caller.
  action: (effect) =>
    Effect.provideServiceEffect(
      effect,
      CurrentWorkspace,
      Effect.gen(function* () {
        const { runQuery } = yield* QueryRunner;
        return yield* runQuery(refs.internal.workspaces.current, {});
      }).pipe(Effect.catchTag("SchemaError", Effect.die)),
    ),
});
