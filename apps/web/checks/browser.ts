import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { chromium, type Page } from "playwright";

export const appUrl = process.env.APP_URL ?? "http://localhost:3000";

// A run signs up test users and saves images that are never deleted, and on Convex Cloud every
// read and write counts toward the plan. So the checks run on a local backend unless asked not to.
const backend = process.env.CONVEX_URL;
if (
  backend &&
  !["127.0.0.1", "localhost"].includes(new URL(backend).hostname) &&
  process.env.REFHAVEN_CLOUD_CHECKS !== "1"
) {
  throw new Error(
    `CONVEX_URL is ${backend}, a cloud deployment. Run the checks on a local backend (see the README), or set REFHAVEN_CLOUD_CHECKS=1 to run them there anyway.`,
  );
}

export function convexUrl(): string {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL is not set. Run the check through its package script.");
  }
  return url;
}

/** Picks out the backend's WebSocket, for a check that holds its messages back. */
export const backendSocket = (url: URL) => url.host === new URL(convexUrl()).host;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL ${message}`);
  }
  console.log(`ok   ${message}`);
}

/**
 * Collects what a check's pages log as errors, for the check's last assertion. Chromium fails
 * every request in flight with `net::ERR_NETWORK_CHANGED` when the machine's network changes, and
 * some machines' networks change every few minutes. That says nothing about the app, so it is
 * counted apart and printed. A request the app needed still fails the assertion that waits for it.
 */
export function consoleWatch() {
  const errors: Array<string> = [];
  let networkChanges = 0;
  const record = (text: string) => {
    if (text.includes("net::ERR_NETWORK_CHANGED")) networkChanges += 1;
    else errors.push(text);
  };
  return {
    watch(page: Page) {
      page.on("console", (message) => {
        if (message.type() === "error") record(message.text());
      });
      page.on("pageerror", (error) => record(String(error)));
    },
    assertClean() {
      if (networkChanges > 0) {
        console.log(
          `note the network changed during the run, and Chromium failed ${networkChanges} request(s) in flight`,
        );
      }
      assert(errors.length === 0, `the browser console shows no error: ${errors.join(" | ")}`);
    },
  };
}

export async function openPageWithPasskeyDevice(args: string[] = []) {
  const browser = await chromium.launch({ args });
  const context = await browser.newContext();
  // The virtual device answers passkey autofill the moment a page asks, which no person's browser
  // does, so on a fast backend autofill signs in before the button is pressed. With autofill off,
  // every sign-in goes through the button.
  await context.addInitScript(() => {
    if (typeof PublicKeyCredential === "undefined") return;
    Object.defineProperty(PublicKeyCredential, "isConditionalMediationAvailable", {
      value: async () => false,
    });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { browser, page, cdp };
}

export async function signInWithPasskey(page: Page, username: string) {
  await page.goto(`${appUrl}/sign-in`);
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await page.waitForURL(`${appUrl}/library`);
}

export async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.startsWith("__convexAuthJWT_"));
    return key ? localStorage.getItem(key) : null;
  });
  if (!token) {
    throw new Error("The page holds no Convex Auth access token.");
  }
  return token;
}

export const pngOf = async (page: Page, color: string, width: number, height = width) =>
  Buffer.from(
    await page.evaluate(
      ({ color, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "white");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png").split(",")[1]!;
      },
      { color, width, height },
    ),
    "base64",
  );

/** The card of the image named `fileName`, whose link the image names with its whole file name. */
export const cardNamed = (page: Page, fileName: string) =>
  page
    .locator("[data-ref-id]")
    .filter({ has: page.getByRole("link", { name: fileName, exact: true }) });

export const outcome = (call: Promise<unknown>) =>
  call.then(
    () => "accepted",
    (error: Error) =>
      error instanceof ConvexError
        ? String(error.data._tag)
        : `refused (${error.message.split("\n")[1]?.trim()})`,
  );

export const rows = async (table: string, limit = 200) => {
  const dump = Bun.spawn(
    ["bunx", "convex", "data", table, "--limit", String(limit), "--format", "jsonLines"],
    { cwd: `${import.meta.dir}/../../../packages/backend`, stdout: "pipe", stderr: "ignore" },
  );
  return (await new Response(dump.stdout).text())
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
};

/**
 * The page's access token with a few seconds of its life left. A token lives one minute, and the
 * page fetches the next one shortly before the end.
 */
async function liveToken(page: Page) {
  for (let tries = 0; tries < 40; tries += 1) {
    const token = await accessToken(page);
    const { exp } = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as {
      exp: number;
    };
    if (exp * 1000 - Date.now() > 5000) return token;
    await Bun.sleep(500);
  }
  throw new Error("The page did not fetch a new access token.");
}

/**
 * An HTTP client that acts as the page's user. Each call takes the page's token of that moment. A
 * token set once ends a minute later, which is in the middle of a long check.
 */
export const clientFor = async (page: Page) => {
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(await liveToken(page));
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property !== "query" && property !== "mutation" && property !== "action") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: Array<unknown>) => {
        target.setAuth(await liveToken(page));
        return value.apply(target, args);
      };
    },
  });
};

export type Carried = { name: string; mimeType: string; buffer: Buffer };

/**
 * Sends the page one event of the kind a real drag or paste makes, carrying files or text, and
 * returns what the page did with it. `at` is a drop's point in the page's client coordinates. A
 * page that saves files takes an event by cancelling it on `document`. The app refuses a stray
 * drag of files by cancelling it later, on `window`, so the browser does not open the file.
 * Chromium ignores `dropEffect` on a made-up event, so the cursor is not checked.
 */
export const send = (
  page: Page,
  kind: "dragstart" | "dragend" | "dragover" | "drop" | "paste",
  carried: ReadonlyArray<Carried> | string,
  target = "body",
  at?: { x: number; y: number },
) =>
  page.evaluate(
    ({ kind, files, text, target, at }) => {
      const transfer = new DataTransfer();
      for (const { name, mimeType, base64 } of files) {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        transfer.items.add(new File([bytes], name, { type: mimeType }));
      }
      if (text !== null) transfer.setData("text/plain", text);
      // During a real `dragover` a browser hides the files and shows only their type.
      if (kind === "dragover") {
        Object.defineProperty(transfer, "files", { value: new DataTransfer().files });
      }
      const init = { bubbles: true, cancelable: true, clientX: at?.x ?? 0, clientY: at?.y ?? 0 };
      const event =
        kind === "paste"
          ? new ClipboardEvent(kind, { ...init, clipboardData: transfer })
          : new DragEvent(kind, { ...init, dataTransfer: transfer });
      let cancelledOnDocument = false;
      // Added last, so it runs after the page's own listeners on `document` and before `window`'s.
      document.addEventListener(kind, () => (cancelledOnDocument = event.defaultPrevented), {
        once: true,
      });
      document.querySelector(target)!.dispatchEvent(event);
      return cancelledOnDocument ? "taken" : event.defaultPrevented ? "refused" : "left alone";
    },
    {
      kind,
      target,
      at,
      files:
        typeof carried === "string"
          ? []
          : carried.map(({ name, mimeType, buffer }) => ({
              name,
              mimeType,
              base64: buffer.toString("base64"),
            })),
      text: typeof carried === "string" ? carried : null,
    },
  );
