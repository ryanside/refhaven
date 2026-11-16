import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.internalMutation({
      name: "createUser",
      args: () => ({
        method: Schema.Struct({
          name: Schema.Literal("usernamePasskey"),
          profile: Schema.Struct({}),
        }),
      }),
      returns: () => Id("users"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "whoAmI",
      args: () => ({
        greeting: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(20)),
      }),
      returns: () =>
        Schema.Struct({
          userId: Id("users"),
          username: Schema.NullOr(Schema.String),
          message: Schema.String,
        }),
    }).middleware(RequireWorkspace),
  );
