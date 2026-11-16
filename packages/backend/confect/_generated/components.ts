import { componentsGeneric } from "convex/server";

export type Components = {
  "auth": import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  "authPasskey": import("@convex-dev/auth/components/passkey/_generated/component.js").ComponentApi<"authPasskey">;
  "authUsername": import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  "r2": import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};

export const components: Components = componentsGeneric() as any;
