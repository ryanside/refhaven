import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import blobs from "./tables/blobs";
import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import refs from "./tables/refs";
import uploads from "./tables/uploads";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

export default $defineSchema({
  blobs: $Table.tableDefinition(blobs),
  canvasItems: $Table.tableDefinition(canvasItems),
  canvases: $Table.tableDefinition(canvases),
  refs: $Table.tableDefinition(refs),
  uploads: $Table.tableDefinition(uploads),
  users: $Table.tableDefinition(users),
  workspaces: $Table.tableDefinition(workspaces),
});
