import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import collectionRefs from "./tables/collectionRefs";
import collections from "./tables/collections";
import orphans from "./tables/orphans";
import refs from "./tables/refs";
import tags from "./tables/tags";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

export default $defineSchema({
  blobs: $Table.tableDefinition(blobs),
  canvasItems: $Table.tableDefinition(canvasItems),
  canvases: $Table.tableDefinition(canvases),
  collectionRefs: $Table.tableDefinition(collectionRefs),
  collections: $Table.tableDefinition(collections),
  orphans: $Table.tableDefinition(orphans),
  refs: $Table.tableDefinition(refs),
  tags: $Table.tableDefinition(tags),
  users: $Table.tableDefinition(users),
  workspaces: $Table.tableDefinition(workspaces),
});
