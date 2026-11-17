// Read-only health check for the refhaven instance of this checkout. Run it through `verify.sh doctor`.
import { readdirSync, readFileSync, statSync } from "node:fs";

const root = process.env.ROOT!;
const url = process.env.VERIFY_URL!;
const web = `${root}/apps/web`;
const backend = `${root}/packages/backend`;

let failed = false;
const report = (ok: boolean | "warn", message: string) => {
  if (ok === false) failed = true;
  console.log(`${ok === true ? "ok  " : ok === "warn" ? "warn" : "FAIL"} ${message}`);
};

const run = async (command: string[], cwd = root) => {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return { stdout: stdout.trim(), exitCode };
};

const deployment =
  /^CONVEX_DEPLOYMENT=(\S+)/m.exec(
    await Bun.file(`${backend}/.env.local`)
      .text()
      .catch(() => ""),
  )?.[1] ?? "";
report(
  deployment.startsWith("dev:"),
  `the backend targets a dev deployment (${deployment || "no .env.local"})`,
);

const listener = (await run(["lsof", "-nP", "-iTCP:3000", "-sTCP:LISTEN", "-t"])).stdout.split(
  "\n",
)[0];
const listenerCwd = listener
  ? ((await run(["lsof", "-a", "-p", listener, "-d", "cwd", "-Fn"])).stdout.match(
      /^n(.*)$/m,
    )?.[1] ?? "")
  : "";
report(
  listenerCwd === web,
  listener
    ? `port 3000 is served by pid ${listener} from ${listenerCwd}`
    : "nothing listens on port 3000. Run `verify.sh up`",
);

for (const path of ["/", "/sign-in"]) {
  const status = await fetch(`${url}${path}`).then(
    (response) => response.status,
    () => 0,
  );
  report(status === 200, `GET ${path} answers ${status}`);
}

const local = new Set(
  readdirSync(`${backend}/convex`)
    .filter((file) => file.endsWith(".ts") && !file.includes(".config"))
    .flatMap((file) =>
      [
        ...readFileSync(`${backend}/convex/${file}`, "utf8").matchAll(/^export const (\w+) =/gm),
      ].map((match) => `${file.replace(/\.ts$/, ".js")}:${match[1]}`),
    ),
);
const spec = await run(["bunx", "convex", "function-spec"], backend);
if (spec.exitCode !== 0) {
  report(
    false,
    "`convex function-spec` failed. Check the Convex login with `bunx convex dev --once`",
  );
} else {
  const deployed = new Set<string>(
    JSON.parse(spec.stdout).functions.map((fn: { identifier: string }) => fn.identifier),
  );
  const missing = [...local].filter((name) => !deployed.has(name));
  const extra = [...deployed].filter((name) => !local.has(name));
  report(
    missing.length === 0 && extra.length === 0,
    `the deployment runs this checkout's ${local.size} functions` +
      (missing.length ? `. Not deployed: ${missing.join(", ")}` : "") +
      (extra.length ? `. Deployed but not in this checkout: ${extra.join(", ")}` : ""),
  );
}

// The names above cannot show a function whose code changed. `convex dev` logs the time of each
// push, so a backend file saved after the last push means the deployment still runs older code.
const devLog = process.env.DEV_LOG;
if (!devLog) {
  report(
    "warn",
    "cannot tell whether the last backend change was pushed. Name a run whose `up` started the dev server",
  );
} else {
  const sources = [`${backend}/confect`, `${backend}/convex`, `${root}/packages/scene/src`];
  const savedAt = () =>
    Math.max(
      ...sources.flatMap((directory) =>
        readdirSync(directory, { recursive: true, encoding: "utf8" }).map(
          (file) => statSync(`${directory}/${file}`).mtimeMs,
        ),
      ),
    );
  const pushedAt = () => {
    const time = [
      ...readFileSync(devLog, "utf8").matchAll(/(\d\d):(\d\d):(\d\d) Convex functions ready/g),
    ].at(-1);
    if (!time) return 0;
    const pushed = new Date();
    pushed.setHours(Number(time[1]), Number(time[2]), Number(time[3]), 999);
    // The log holds a time of day. One that lies ahead of now was written before midnight.
    return pushed.getTime() > Date.now() + 60_000
      ? pushed.getTime() - 86_400_000
      : pushed.getTime();
  };
  // A push takes a few seconds after a save, so a save just now gets time to land.
  for (let waited = 0; waited < 20 && pushedAt() < savedAt(); waited++) {
    await Bun.sleep(1000);
  }
  const clock = (time: number) => new Date(time).toTimeString().slice(0, 8);
  report(
    pushedAt() >= savedAt(),
    pushedAt() >= savedAt()
      ? `the last push, at ${clock(pushedAt())}, is newer than every backend file`
      : `a backend file was saved at ${clock(savedAt())}, after the last push at ${clock(pushedAt())}. \`convex dev\` has not pushed it. Read ${devLog}, then run \`verify.sh down\` and \`verify.sh up\``,
  );
}

const names = new Set(
  (await run(["bunx", "convex", "env", "list"], backend)).stdout
    .split("\n")
    .map((line) => line.split("=")[0]!.trim()),
);
const r2 = ["R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const missingR2 = r2.filter((name) => !names.has(name));
report(
  missingR2.length === 0 ? true : "warn",
  missingR2.length === 0
    ? "the deployment has the four R2 variables"
    : `the deployment lacks ${missingR2.join(", ")}. Saving images and the canvas cannot be driven`,
);
report(
  !names.has("AUTH_ORIGIN") && !names.has("AUTH_RP_ID") ? true : "warn",
  names.has("AUTH_ORIGIN") || names.has("AUTH_RP_ID")
    ? "AUTH_ORIGIN or AUTH_RP_ID is set on the deployment. Passkey sign-in works only if they name localhost:3000"
    : "passkeys are bound to http://localhost:3000, the default",
);

const chromium = await run(
  ["bun", "-e", "import { chromium } from 'playwright'; await (await chromium.launch()).close();"],
  web,
);
report(
  chromium.exitCode === 0,
  chromium.exitCode === 0
    ? "headless Chromium starts"
    : "headless Chromium does not start. Run `verify.sh up`",
);

console.log(failed ? "doctor: not worth driving until every FAIL is fixed" : "doctor: healthy");
process.exit(failed ? 1 : 0);
