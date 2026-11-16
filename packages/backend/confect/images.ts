import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import type { DataModel } from "../convex/_generated/dataModel";
import { components } from "./_generated/components";

export const r2 = new R2(components.r2);

export const uploadKeyPrefix = (userId: string) => `u/${userId}/`;

// The component's own generateUploadUrl is not exported. Its syncMetadata takes
// any key from the client, so a key counts as the caller's only when it sits
// under the caller's prefix, which images.generateUploadUrl issues.
export const { syncMetadata } = r2.clientApi<DataModel>({
  onUpload: async (ctx, _bucket, key) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null || !key.startsWith(uploadKeyPrefix(userId))) {
      throw new Error("This upload key does not belong to the caller");
    }
    const recorded = await ctx.db
      .query("uploads")
      .withIndex("by_user_and_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (recorded === null) {
      await ctx.db.insert("uploads", { userId, key });
    }
  },
});
