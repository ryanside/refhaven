import { MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type { Id } from "../_generated/id";

export class CurrentWorkspace extends Context.Service<
  CurrentWorkspace,
  { readonly userId: Id<"users">; readonly workspaceId: Id<"workspaces"> }
>()("confect/middleware/RequireWorkspace.spec/CurrentWorkspace") {}

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()("NotSignedIn", {}) {}

export default class RequireWorkspace extends MiddlewareSpec.MiddlewareSpec<
  RequireWorkspace,
  { provides: CurrentWorkspace }
>()("RequireWorkspace", {
  error: () => NotSignedIn,
  functionTypes: { query: true, mutation: true, action: true },
}) {}
