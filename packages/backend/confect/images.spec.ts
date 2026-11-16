import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import type { syncMetadata } from "./images";
import RequireUser from "./middleware/RequireUser.spec";

const KeyAndUrl = Schema.Struct({ key: Schema.String, url: Schema.String });

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "generateUploadUrl",
      returns: () => KeyAndUrl,
    }).middleware(RequireUser),
  )
  .addFunction(FunctionSpec.convexPublicMutation<typeof syncMetadata>()("syncMetadata"))
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(KeyAndUrl),
    }).middleware(RequireUser),
  );
