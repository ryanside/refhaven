import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../images.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../images.spec")["default"]>(databaseSchema, groupLayer);

export default {
["generateUploadUrl"]: RegisteredConvexFunction.register({ ...definitions["generateUploadUrl"], handler: forward(definitions["generateUploadUrl"].handler) }),
["syncMetadata"]: definitions["syncMetadata"].handler,
["list"]: RegisteredConvexFunction.register({ ...definitions["list"], handler: forward(definitions["list"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../images.spec")["default"]>;
