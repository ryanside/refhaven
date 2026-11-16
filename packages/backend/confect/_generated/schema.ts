import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import canvasItems from "./tables/canvasItems";
import canvases from "./tables/canvases";
import uploads from "./tables/uploads";
import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly canvasItems: typeof canvasItems;
  readonly canvases: typeof canvases;
  readonly uploads: typeof uploads;
  readonly users: typeof users;
}> = $DatabaseSchema.make({
  canvasItems,
  canvases,
  uploads,
  users,
});

export default databaseSchema;
