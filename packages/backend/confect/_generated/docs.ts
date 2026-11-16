import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type BlobsDoc = Document.Document<typeof schemaDefinition, "blobs">;
export type RefsDoc = Document.Document<typeof schemaDefinition, "refs">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;
export type WorkspacesDoc = Document.Document<typeof schemaDefinition, "workspaces">;

export interface Docs {
  blobs: BlobsDoc;
  refs: RefsDoc;
  users: UsersDoc;
  workspaces: WorkspacesDoc;
}
