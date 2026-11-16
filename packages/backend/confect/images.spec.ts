import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import type { generateUploadUrl, syncMetadata } from "./images";
import RequireUser from "./middleware/RequireUser.spec";

export default GroupSpec.make()
  .addFunction(FunctionSpec.convexPublicMutation<typeof generateUploadUrl>()("generateUploadUrl"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof syncMetadata>()("syncMetadata"))
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(Schema.Struct({ key: Schema.String, url: Schema.String })),
    }).middleware(RequireUser),
  );
