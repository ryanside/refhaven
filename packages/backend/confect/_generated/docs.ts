import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type CanvasItemsDoc = Document.Document<typeof schemaDefinition, "canvasItems">;
export type CanvasesDoc = Document.Document<typeof schemaDefinition, "canvases">;
export type UploadsDoc = Document.Document<typeof schemaDefinition, "uploads">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;
export type WorkspacesDoc = Document.Document<typeof schemaDefinition, "workspaces">;

export interface Docs {
  canvasItems: CanvasItemsDoc;
  canvases: CanvasesDoc;
  uploads: UploadsDoc;
  users: UsersDoc;
  workspaces: WorkspacesDoc;
}
