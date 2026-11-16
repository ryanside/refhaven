import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import RequireWorkspace from "./middleware/RequireWorkspace.impl";
import { CurrentWorkspace } from "./middleware/RequireWorkspace.spec";
import workspaces from "./workspaces.spec";

const current = FunctionImpl.make(databaseSchema, workspaces, "current", () =>
  Effect.gen(function* () {
    const { userId, workspaceId } = yield* CurrentWorkspace;
    return { userId, workspaceId };
  }),
);

export default GroupImpl.make(databaseSchema, workspaces).pipe(
  Layer.provide(current),
  Layer.provide(RequireWorkspace),
  GroupImpl.finalize,
);
