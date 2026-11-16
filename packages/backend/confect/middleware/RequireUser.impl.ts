import { getAuthUserId } from "@convex-dev/auth/server";
import { MiddlewareImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import databaseSchema from "../_generated/schema";
import { MutationCtx, QueryCtx } from "../_generated/services";
import RequireUser, { CurrentUser, NotSignedIn } from "./RequireUser.spec";

const signedInUser = (ctx: Parameters<typeof getAuthUserId>[0]) =>
  Effect.promise(() => getAuthUserId(ctx)).pipe(
    Effect.flatMap((userId) =>
      userId === null ? Effect.fail(new NotSignedIn()) : Effect.succeed({ userId }),
    ),
  );

export default MiddlewareImpl.makeByFunctionType(databaseSchema, RequireUser, {
  query: (effect) =>
    Effect.provideServiceEffect(
      effect,
      CurrentUser,
      Effect.gen(function* () {
        return yield* signedInUser(yield* QueryCtx);
      }),
    ),
  mutation: (effect) =>
    Effect.provideServiceEffect(
      effect,
      CurrentUser,
      Effect.gen(function* () {
        return yield* signedInUser(yield* MutationCtx);
      }),
    ),
});
