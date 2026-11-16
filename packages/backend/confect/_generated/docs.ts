import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type BlobsDoc = Document.Document<typeof schemaDefinition, "blobs">;
export type CanvasItemsDoc = Document.Document<typeof schemaDefinition, "canvasItems">;
export type CanvasesDoc = Document.Document<typeof schemaDefinition, "canvases">;
export type RefsDoc = Document.Document<typeof schemaDefinition, "refs">;
export type UploadsDoc = Document.Document<typeof schemaDefinition, "uploads">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;
export type WorkspacesDoc = Document.Document<typeof schemaDefinition, "workspaces">;

export interface Docs {
  blobs: BlobsDoc;
  canvasItems: CanvasItemsDoc;
  canvases: CanvasesDoc;
  refs: RefsDoc;
  uploads: UploadsDoc;
  users: UsersDoc;
  workspaces: WorkspacesDoc;
}
