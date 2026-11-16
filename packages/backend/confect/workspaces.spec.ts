import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import RequireWorkspace from "./middleware/RequireWorkspace.spec";

export default GroupSpec.make().addFunction(
  FunctionSpec.internalQuery({
    name: "current",
    returns: () => Schema.Struct({ userId: Id("users"), workspaceId: Id("workspaces") }),
  }).middleware(RequireWorkspace),
);
