import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import users from "./tables/users";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly users: typeof users;
}> = $DatabaseSchema.make({
  users,
});

export default databaseSchema;
