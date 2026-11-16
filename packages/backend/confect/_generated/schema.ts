import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly canvasItems: typeof canvasItems;
  readonly canvases: typeof canvases;
  readonly users: typeof users;
}> = $DatabaseSchema.make({
  canvasItems,
  canvases,
  users,
});

export default databaseSchema;
