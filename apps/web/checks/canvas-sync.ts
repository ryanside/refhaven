import net from "node:net"
import {
  appUrl,
  assert,
  convexUrl,
  openPageWithPasskeyDevice,
  signInWithPasskey,
} from "./browser"

const rounds = Number(process.env.ROUNDS ?? 5)
const movesPerRound = Number(process.env.MOVES ?? 5)
const modes = ["live", "plain", "delta"] as const
type Mode = (typeof modes)[number]

type Sample = {
  mode: Mode
  move: number
  messageBytes: number
  wireBytes: number
  resent: number
  totalMs: number
  untilLastFrameMs: number
}

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}
const summary = (values: number[], digits = 0) =>
  `${median(values).toFixed(digits)} (${Math.min(...values).toFixed(digits)} to ${Math.max(...values).toFixed(digits)})`

// Chromium reaches Convex through this local TCP forwarder, so the count is
// the TLS bytes that crossed the network, after WebSocket compression.
const convexHost = new URL(convexUrl()).hostname
let wireBytes = 0
const forwarder = net.createServer((client) => {
  const upstream = net.connect(443, convexHost)
  const close = () => {
    client.destroy()
    upstream.destroy()
  }
  client.on("error", close)
  upstream.on("error", close)
  upstream.on("data", (chunk) => {
    wireBytes += chunk.length
  })
  client.pipe(upstream)
  upstream.pipe(client)
})
await new Promise<void>((resolve) => forwarder.listen(0, "127.0.0.1", resolve))
const forwarderPort = (forwarder.address() as net.AddressInfo).port

const { browser, page, cdp } = await openPageWithPasskeyDevice([
  `--host-resolver-rules=MAP ${convexHost}:443 127.0.0.1:${forwarderPort}`,
])

const received: number[] = []
const handshakes: Array<string | undefined> = []
await cdp.send("Network.enable")
cdp.on("Network.webSocketFrameReceived", ({ response }) => {
  received.push(Buffer.byteLength(response.payloadData))
})
cdp.on("Network.webSocketHandshakeResponseReceived", ({ response }) => {
  const header = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === "sec-websocket-extensions"
  )
  handshakes.push(header?.[1])
})
const bytesSince = (index: number) =>
  received.slice(index).reduce((sum, bytes) => sum + bytes, 0)

await page.context().addInitScript(() => {
  const frameTimes: number[] = []
  Object.assign(window, { __frameTimes: frameTimes })
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.addEventListener("message", () => {
        frameTimes.push(performance.now())
      })
    }
  }
})

const itemCount = () =>
  page.getByTestId("item-count").textContent().then(Number)

try {
  await signInWithPasskey(page, `check-${Date.now().toString(36)}`)
  await page.goto(`${appUrl}/lab/canvas-sync`)
  await page.getByRole("button", { name: "Seed 1,000 items" }).click()
  await page.getByTestId("item-count").waitFor()
  assert((await itemCount()) === 1000, "seeded 1,000 canvas items")
  const canvasId = new URL(page.url()).searchParams.get("canvasId")

  const loads: Record<Mode, { messageBytes: number[]; wireBytes: number[] }> =
    {
      live: { messageBytes: [], wireBytes: [] },
      plain: { messageBytes: [], wireBytes: [] },
      delta: { messageBytes: [], wireBytes: [] },
    }
  const samples: Sample[] = []

  for (let round = 0; round < rounds; round++) {
    for (const mode of modes) {
      const beforeLoad = received.length
      const wireBeforeLoad = wireBytes
      await page.goto(
        `${appUrl}/lab/canvas-sync?mode=${mode}&canvasId=${canvasId}`
      )
      await page.getByTestId("item-count").waitFor()
      await page.waitForTimeout(500)
      loads[mode].messageBytes.push(bytesSince(beforeLoad))
      loads[mode].wireBytes.push(wireBytes - wireBeforeLoad)

      for (let move = 1; move <= movesPerRound; move++) {
        const beforeMove = received.length
        const wireBeforeMove = wireBytes
        await page.getByRole("button", { name: "Move one item" }).click()
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-testid="applied"]')
              ?.getAttribute("data-moves") === String(expected),
          move
        )
        const timing = await page.evaluate(() => {
          const applied = document.querySelector('[data-testid="applied"]')!
          const startedAt = Number(applied.getAttribute("data-started-at"))
          const appliedAt = Number(applied.getAttribute("data-applied-at"))
          const frameTimes = (window as unknown as { __frameTimes: number[] })
            .__frameTimes
          const lastFrameAt = frameTimes.findLast((at) => at <= appliedAt)
          return { startedAt, appliedAt, lastFrameAt }
        })
        samples.push({
          mode,
          move,
          messageBytes: bytesSince(beforeMove),
          wireBytes: wireBytes - wireBeforeMove,
          resent: Number(await page.getByTestId("resent").textContent()),
          totalMs: timing.appliedAt - timing.startedAt,
          untilLastFrameMs: (timing.lastFrameAt ?? NaN) - timing.startedAt,
        })
      }
      assert(
        (await itemCount()) === 1000,
        `round ${round + 1} ${mode}: ${movesPerRound} moves applied, still 1,000 items`
      )
    }
  }

  console.log(`\nWebSocket extensions negotiated: ${JSON.stringify(handshakes)}`)
  console.log(
    `Samples per mode: ${rounds} page loads, ${rounds * movesPerRound} moves. Values are median (min to max).\n`
  )
  for (const mode of modes) {
    const own = samples.filter((sample) => sample.mode === mode)
    console.log(`mode=${mode}`)
    console.log(
      `  to open the canvas: ${summary(loads[mode].messageBytes)} message bytes, ${summary(loads[mode].wireBytes)} wire bytes`
    )
    for (const move of [1, movesPerRound]) {
      const atMove = own.filter((sample) => sample.move === move)
      console.log(
        `  move ${move} of a session: ${summary(atMove.map((s) => s.messageBytes))} message bytes, ${summary(atMove.map((s) => s.wireBytes))} wire bytes, ${summary(atMove.map((s) => s.resent))} items resent`
      )
    }
    console.log(
      `  ms from mutation call to updated items in React: ${summary(own.map((s) => s.totalMs), 1)}`
    )
    console.log(
      `    of which until the last WebSocket frame arrived: ${summary(own.map((s) => s.untilLastFrameMs), 1)}`
    )
    console.log(
      `    of which from that frame to React: ${summary(own.map((s) => s.totalMs - s.untilLastFrameMs), 1)}`
    )
  }
} finally {
  await browser.close()
  forwarder.close()
}
