import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

export interface Docs {
  users: UsersDoc;
}
