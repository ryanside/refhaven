import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type CanvasItemsDoc = Document.Document<typeof schemaDefinition, "canvasItems">;
export type CanvasesDoc = Document.Document<typeof schemaDefinition, "canvases">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

export interface Docs {
  canvasItems: CanvasItemsDoc;
  canvases: CanvasesDoc;
  users: UsersDoc;
}
