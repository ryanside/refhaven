import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default Table.make(() =>
  Schema.Struct({
    userId: Id("users"),
    rev: Schema.Int,
  }),
).index("by_user", ["userId"]);
