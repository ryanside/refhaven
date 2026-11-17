import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type BlobsDoc = Document.Document<typeof schemaDefinition, "blobs">;
export type CanvasItemsDoc = Document.Document<typeof schemaDefinition, "canvasItems">;
export type CanvasesDoc = Document.Document<typeof schemaDefinition, "canvases">;
export type CollectionRefsDoc = Document.Document<typeof schemaDefinition, "collectionRefs">;
export type CollectionsDoc = Document.Document<typeof schemaDefinition, "collections">;
export type OrphansDoc = Document.Document<typeof schemaDefinition, "orphans">;
export type RefsDoc = Document.Document<typeof schemaDefinition, "refs">;
export type TagsDoc = Document.Document<typeof schemaDefinition, "tags">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;
export type WorkspacesDoc = Document.Document<typeof schemaDefinition, "workspaces">;

export interface Docs {
  blobs: BlobsDoc;
  canvasItems: CanvasItemsDoc;
  canvases: CanvasesDoc;
  collectionRefs: CollectionRefsDoc;
  collections: CollectionsDoc;
  orphans: OrphansDoc;
  refs: RefsDoc;
  tags: TagsDoc;
  users: UsersDoc;
  workspaces: WorkspacesDoc;
}
