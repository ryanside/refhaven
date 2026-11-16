import { MiddlewareSpec } from "@confect/core";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type { Id } from "../_generated/id";

export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly userId: Id<"users"> }
>()("confect/middleware/RequireUser.spec/CurrentUser") {}

export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  "NotSignedIn",
  {},
) {}

export default class RequireUser extends MiddlewareSpec.MiddlewareSpec<
  RequireUser,
  { provides: CurrentUser }
>()("RequireUser", {
  error: () => NotSignedIn,
  functionTypes: { query: true, mutation: true, action: false },
}) {}
