import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default Table.make(() =>
  Schema.Struct({
    ownerId: Id("users"),
  }),
).index("by_owner", ["ownerId"]);
