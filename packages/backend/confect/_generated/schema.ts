import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import collectionRefs from "./tables/collectionRefs";
import collections from "./tables/collections";
import orphans from "./tables/orphans";
import pendingUploads from "./tables/pendingUploads";
import refs from "./tables/refs";
import tags from "./tables/tags";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly blobs: typeof blobs;
  readonly canvasItems: typeof canvasItems;
  readonly canvases: typeof canvases;
  readonly collectionRefs: typeof collectionRefs;
  readonly collections: typeof collections;
  readonly orphans: typeof orphans;
  readonly pendingUploads: typeof pendingUploads;
  readonly refs: typeof refs;
  readonly tags: typeof tags;
  readonly users: typeof users;
  readonly workspaces: typeof workspaces;
}> = $DatabaseSchema.make({
  blobs,
  canvasItems,
  canvases,
  collectionRefs,
  collections,
  orphans,
  pendingUploads,
  refs,
  tags,
  users,
  workspaces,
});

export default databaseSchema;
