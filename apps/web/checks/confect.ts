import { api } from "@refhaven/backend/api"
import { ConvexHttpClient } from "convex/browser"
import {
  accessToken,
  assert,
  convexUrl,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser"

const username = `check-${Date.now().toString(36)}`
const { browser, page } = await openPageWithPasskeyDevice()
try {
  await signInWithPasskey(page, username)
  const shown = {
    message: await page.getByTestId("message").textContent(),
    username: await page.getByTestId("username").textContent(),
    userId: await page.getByTestId("user-id").textContent(),
  }
  assert(
    shown.message === `Hello, ${username}` && shown.username === username,
    `the browser called users.whoAmI and got the signed-in user: ${JSON.stringify(shown)}`
  )

  const client = new ConvexHttpClient(convexUrl())
  client.setAuth(await accessToken(page))
  const rejected = (args: unknown) =>
    client
      .query(api.users.whoAmI, args as { greeting: string })
      .then(() => "accepted", (error: Error) => error.message.split("\n").slice(0, 4).join(" | "))

  const valid = await client.query(api.users.whoAmI, { greeting: "Hi" })
  assert(
    valid.message === `Hi, ${username}` && valid.userId === shown.userId,
    `a valid call returns the declared shape: ${JSON.stringify(valid)}`
  )

  const wrongType = await rejected({ greeting: 123 })
  assert(wrongType !== "accepted", `a number for greeting is rejected: ${wrongType}`)

  const empty = await rejected({ greeting: "" })
  assert(empty !== "accepted", `an empty greeting is rejected: ${empty}`)

  const tooLong = await rejected({ greeting: "x".repeat(21) })
  assert(tooLong !== "accepted", `a 21-character greeting is rejected: ${tooLong}`)

  const extraField = await rejected({ greeting: "Hi", admin: true })
  assert(extraField !== "accepted", `an undeclared argument is rejected: ${extraField}`)
} finally {
  await browser.close()
}
