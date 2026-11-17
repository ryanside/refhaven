import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.internalMutation({
    name: "backfill",
    args: () => ({ cursor: Schema.optionalKey(Schema.String) }),
    returns: () => Schema.Struct({ filled: Schema.Int, isDone: Schema.Boolean }),
  }),
);
