import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import uploads from "./tables/uploads";
import users from "./tables/users";

export default $defineSchema({
  canvasItems: $Table.tableDefinition(canvasItems),
  canvases: $Table.tableDefinition(canvases),
  uploads: $Table.tableDefinition(uploads),
  users: $Table.tableDefinition(users),
});
