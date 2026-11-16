import { chromium, type Page } from "playwright"

export const appUrl = process.env.APP_URL ?? "http://localhost:3000"

export function convexUrl(): string {
  const url = process.env.CONVEX_URL
  if (!url) {
    throw new Error("CONVEX_URL is not set. Run the check through its package script.")
  }
  return url
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL ${message}`)
  }
  console.log(`ok   ${message}`)
}

export async function openPageWithPasskeyDevice(args: string[] = []) {
  const browser = await chromium.launch({ args })
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return { browser, page, cdp }
}

export async function signInWithPasskey(page: Page, username: string) {
  await page.goto(`${appUrl}/sign-in`)
  await page.getByLabel("Username").fill(username)
  await page.getByRole("button", { name: "Continue with a passkey" }).click()
  await page.waitForURL(`${appUrl}/library`)
}

export async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("__convexAuthJWT_")
    )
    return key ? localStorage.getItem(key) : null
  })
  if (!token) {
    throw new Error("The page holds no Convex Auth access token.")
  }
  return token
}
