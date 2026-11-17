import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import collectionRefs from "./tables/collectionRefs";
import collections from "./tables/collections";
import refs from "./tables/refs";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

export default $defineSchema({
  blobs: $Table.tableDefinition(blobs),
  canvasItems: $Table.tableDefinition(canvasItems),
  canvases: $Table.tableDefinition(canvases),
  collectionRefs: $Table.tableDefinition(collectionRefs),
  collections: $Table.tableDefinition(collections),
  refs: $Table.tableDefinition(refs),
  users: $Table.tableDefinition(users),
  workspaces: $Table.tableDefinition(workspaces),
});
