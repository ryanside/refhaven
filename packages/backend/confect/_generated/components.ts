import { componentsGeneric } from "convex/server";

export type Components = {
  "auth": import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  "authPasskey": import("@convex-dev/auth/components/passkey/_generated/component.js").ComponentApi<"authPasskey">;
  "authUsername": import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};

export const components: Components = componentsGeneric() as any;
