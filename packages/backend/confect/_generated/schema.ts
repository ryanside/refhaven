import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import collectionRefs from "./tables/collectionRefs";
import collections from "./tables/collections";
import refs from "./tables/refs";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly blobs: typeof blobs;
  readonly canvasItems: typeof canvasItems;
  readonly canvases: typeof canvases;
  readonly collectionRefs: typeof collectionRefs;
  readonly collections: typeof collections;
  readonly refs: typeof refs;
  readonly users: typeof users;
  readonly workspaces: typeof workspaces;
}> = $DatabaseSchema.make({
  blobs,
  canvasItems,
  canvases,
  collectionRefs,
  collections,
  refs,
  users,
  workspaces,
});

export default databaseSchema;
