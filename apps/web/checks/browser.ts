import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { chromium, type Page } from "playwright";

export const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export function convexUrl(): string {
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL is not set. Run the check through its package script.");
  }
  return url;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL ${message}`);
  }
  console.log(`ok   ${message}`);
}

export async function openPageWithPasskeyDevice(args: string[] = []) {
  const browser = await chromium.launch({ args });
  const context = await browser.newContext();
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

export const outcome = (call: Promise<unknown>) =>
  call.then(
    () => "accepted",
    (error: Error) =>
      error instanceof ConvexError
        ? String(error.data._tag)
        : `refused (${error.message.split("\n")[1]?.trim()})`,
  );

export const rows = async (table: string) => {
  const dump = Bun.spawn(
    ["bunx", "convex", "data", table, "--limit", "200", "--format", "jsonLines"],
    { cwd: `${import.meta.dir}/../../../packages/backend`, stdout: "pipe", stderr: "ignore" },
  );
  return (await new Response(dump.stdout).text())
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
};

export const clientFor = async (page: Page) => {
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(await accessToken(page));
  return client;
};
