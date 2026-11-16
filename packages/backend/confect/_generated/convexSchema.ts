import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import blobs from "./tables/blobs";
import refs from "./tables/refs";
import users from "./tables/users";
import workspaces from "./tables/workspaces";

export default $defineSchema({
  blobs: $Table.tableDefinition(blobs),
  refs: $Table.tableDefinition(refs),
  users: $Table.tableDefinition(users),
  workspaces: $Table.tableDefinition(workspaces),
});
