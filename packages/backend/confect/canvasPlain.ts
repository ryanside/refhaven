import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../convex/_generated/server";

export const items = query({
  args: { canvasId: v.id("canvases") },
  returns: v.array(
    v.object({
      key: v.string(),
      kind: v.literal("image"),
      refId: v.string(),
      x: v.number(),
      y: v.number(),
      scale: v.number(),
      rotation: v.number(),
      flipX: v.boolean(),
      flipY: v.boolean(),
      opacity: v.number(),
      grayscale: v.boolean(),
      z: v.string(),
    }),
  ),
  handler: async (ctx, { canvasId }) => {
    const userId = await getAuthUserId(ctx);
    const canvas = await ctx.db.get("canvases", canvasId);
    if (userId === null || canvas?.userId !== userId) {
      throw new Error("Canvas not found");
    }
    const docs = await ctx.db
      .query("canvasItems")
      .withIndex("by_canvas_and_key", (q) => q.eq("canvasId", canvasId))
      .collect();
    return docs.map(({ _id, _creationTime, canvasId, rev, ...item }) => item);
  },
});
