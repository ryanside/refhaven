import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { items } from "./canvasPlain";
import canvasPlain from "./canvasPlain.spec";

export default GroupImpl.make(databaseSchema, canvasPlain).pipe(
  Layer.provide(FunctionImpl.make(databaseSchema, canvasPlain, "items", items)),
  GroupImpl.finalize,
);
