import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";

/**
 * A check's clock: the time to treat as now, and the one workspace the call may touch. Without it
 * a call reads the real clock and covers every workspace, so a pretend time never reaches another
 * workspace's data.
 */
const args = () => ({
  pretend: Schema.optionalKey(Schema.Struct({ workspaceId: Id("workspaces"), now: Schema.Number })),
});

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.internalMutation({
      name: "purgeBatch",
      args,
      returns: () => Schema.Struct({ purged: Schema.Int, more: Schema.Boolean }),
    }),
  )
  .addFunction(FunctionSpec.internalAction({ name: "purge", args, returns: () => Schema.Int }))
  .addFunction(
    FunctionSpec.internalMutation({
      name: "sweepBatch",
      args,
      returns: () =>
        Schema.Struct({
          sweeping: Schema.Array(
            Schema.Struct({ orphanId: Id("orphans"), keys: Schema.Array(Schema.String) }),
          ),
          more: Schema.Boolean,
        }),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "sweepDone",
      args: () => ({ orphanIds: Schema.Array(Id("orphans")) }),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "sweep",
      args,
      returns: () => Schema.Struct({ swept: Schema.Int, deleted: Schema.Int }),
    }),
  );
