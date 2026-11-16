import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import users from "./tables/users";

export default $defineSchema({
  users: $Table.tableDefinition(users),
});
