import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import type { DataModel } from "../convex/_generated/dataModel";
import { components } from "./_generated/components";

export const r2 = new R2(components.r2);

export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    if ((await getAuthUserId(ctx)) === null) {
      throw new Error("Not signed in");
    }
  },
  onUpload: async (ctx, _bucket, key) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not signed in");
    }
    await ctx.db.insert("uploads", { userId, key });
  },
});
