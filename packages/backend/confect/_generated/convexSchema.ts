import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import users from "./tables/users";

export default $defineSchema({
  canvasItems: $Table.tableDefinition(canvasItems),
  canvases: $Table.tableDefinition(canvases),
  users: $Table.tableDefinition(users),
});
