import { CronJob, CronJobs } from "@confect/server";
import * as Cron from "effect/Cron";
import refs from "./_generated/refs";

const dailyAt = (hour: number, minute: number) =>
  Cron.make({ minutes: [minute], hours: [hour], days: [], months: [], weekdays: [] });

// Neither job passes `pretend`, so each reads the real clock and covers every workspace. Convex
// reads the times as UTC and runs one run of a job at a time.
export default CronJobs.make()
  .add(CronJob.make("purge the trash", dailyAt(9, 0), refs.internal.trash.purge, {}))
  .add(CronJob.make("sweep purged bytes", dailyAt(9, 30), refs.internal.trash.sweep, {}));
