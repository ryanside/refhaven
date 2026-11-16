import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import refs from "./tables/refs";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly blobs: typeof blobs;
  readonly canvasItems: typeof canvasItems;
  readonly canvases: typeof canvases;
  readonly refs: typeof refs;
  readonly users: typeof users;
  readonly workspaces: typeof workspaces;
}> = $DatabaseSchema.make({
  blobs,
  canvasItems,
  canvases,
  refs,
  users,
  workspaces,
});

export default databaseSchema;
