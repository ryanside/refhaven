import net from "node:net";
import { appUrl, assert, convexUrl, openPageWithPasskeyDevice, signInWithPasskey } from "./browser";

const rounds = Number(process.env.ROUNDS ?? 5);
const movesPerRound = Number(process.env.MOVES ?? 5);
const modes = ["live", "plain", "delta"] as const;
type Mode = (typeof modes)[number];

type Sample = {
  mode: Mode;
  move: number;
  messageBytes: number;
  wireBytes: number;
  resent: number;
  totalMs: number;
  untilItemsFrameMs: number;
};

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const summary = (values: number[], digits = 0) =>
  `${median(values).toFixed(digits)} (${Math.min(...values).toFixed(digits)} to ${Math.max(...values).toFixed(digits)})`;

// Chromium reaches Convex through this local TCP forwarder, so the count is
// the TLS bytes that crossed the network, after WebSocket compression.
const convexHost = new URL(convexUrl()).hostname;
let wireBytes = 0;
const forwarder = net.createServer((client) => {
  const upstream = net.connect(443, convexHost);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  upstream.on("data", (chunk) => {
    wireBytes += chunk.length;
  });
  client.pipe(upstream);
  upstream.pipe(client);
});
await new Promise<void>((resolve) => forwarder.listen(0, "127.0.0.1", resolve));
const forwarderPort = (forwarder.address() as net.AddressInfo).port;

const runStartedAt = Date.now() / 1000;

async function serverCalls(since: number) {
  await Bun.sleep(3000);
  const logs = Bun.spawn(["bunx", "convex", "logs", "--history", "2000", "--success", "--jsonl"], {
    cwd: `${import.meta.dir}/../../../packages/backend`,
    stdout: "pipe",
    stderr: "ignore",
  });
  setTimeout(() => logs.kill(), 10_000);
  const calls = new Map<string, Array<{ ms: number; documentsRead: number; bytesRead: number }>>();
  for (const line of (await new Response(logs.stdout).text()).split("\n")) {
    if (!line.startsWith("{")) continue;
    const entry = JSON.parse(line);
    if (
      entry.kind !== "Completion" ||
      entry.timestamp < since ||
      entry.cachedResult ||
      !/^canvas(Plain)?:/.test(entry.identifier)
    ) {
      continue;
    }
    const documentsRead: number = entry.usageStats.databaseReadDocuments;
    const name =
      entry.identifier === "canvas:itemsSince"
        ? `canvas:itemsSince (${documentsRead > 500 ? "snapshot" : "changes"})`
        : entry.identifier;
    calls.set(name, [
      ...(calls.get(name) ?? []),
      {
        ms: entry.executionTime * 1000,
        documentsRead,
        bytesRead: entry.usageStats.databaseReadBytes,
      },
    ]);
  }
  return [...calls].sort(([a], [b]) => a.localeCompare(b));
}

const { browser, page, cdp } = await openPageWithPasskeyDevice([
  `--host-resolver-rules=MAP ${convexHost}:443 127.0.0.1:${forwarderPort}`,
]);

const received: number[] = [];
const handshakes: Array<string | undefined> = [];
await cdp.send("Network.enable");
cdp.on("Network.webSocketFrameReceived", ({ response }) => {
  received.push(Buffer.byteLength(response.payloadData));
});
cdp.on("Network.webSocketHandshakeResponseReceived", ({ response }) => {
  const header = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === "sec-websocket-extensions",
  );
  handshakes.push(header?.[1]);
});
const bytesSince = (index: number) => received.slice(index).reduce((sum, bytes) => sum + bytes, 0);

await page.context().addInitScript(() => {
  const frames: Array<{ at: number; size: number }> = [];
  Object.assign(window, { __frames: frames });
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event) => {
        frames.push({ at: performance.now(), size: String(event.data).length });
      });
    }
  };
});

const itemCount = () => page.getByTestId("item-count").textContent().then(Number);

try {
  await signInWithPasskey(page, `check-${Date.now().toString(36)}`);
  await page.goto(`${appUrl}/lab/canvas-sync`);
  await page.getByRole("button", { name: "Seed 1,000 items" }).click();
  await page.getByTestId("item-count").waitFor();
  assert((await itemCount()) === 1000, "seeded 1,000 canvas items");
  const canvasId = new URL(page.url()).searchParams.get("canvasId");

  const loads: Record<Mode, { messageBytes: number[]; wireBytes: number[] }> = {
    live: { messageBytes: [], wireBytes: [] },
    plain: { messageBytes: [], wireBytes: [] },
    delta: { messageBytes: [], wireBytes: [] },
  };
  const samples: Sample[] = [];

  for (let round = 0; round < rounds; round++) {
    for (const mode of modes) {
      const beforeLoad = received.length;
      const wireBeforeLoad = wireBytes;
      await page.goto(`${appUrl}/lab/canvas-sync?mode=${mode}&canvasId=${canvasId}`);
      await page.getByTestId("item-count").waitFor();
      await page.waitForTimeout(500);
      loads[mode].messageBytes.push(bytesSince(beforeLoad));
      loads[mode].wireBytes.push(wireBytes - wireBeforeLoad);

      for (let move = 1; move <= movesPerRound; move++) {
        const beforeMove = received.length;
        const wireBeforeMove = wireBytes;
        await page.getByRole("button", { name: "Move one item" }).click();
        await page.waitForFunction(
          (expected) =>
            document.querySelector('[data-testid="applied"]')?.getAttribute("data-moves") ===
            String(expected),
          move,
        );
        const timing = await page.evaluate(() => {
          const applied = document.querySelector('[data-testid="applied"]')!;
          const startedAt = Number(applied.getAttribute("data-started-at"));
          const appliedAt = Number(applied.getAttribute("data-applied-at"));
          const { __frames } = window as unknown as {
            __frames: Array<{ at: number; size: number }>;
          };
          // The largest frame between the call and the update is the one that
          // carried the items. The mutation response is smaller.
          const itemsFrame = __frames
            .filter((frame) => frame.at >= startedAt && frame.at <= appliedAt)
            .reduce((largest, frame) => (frame.size > largest.size ? frame : largest), {
              at: NaN,
              size: 0,
            });
          return { startedAt, appliedAt, itemsFrameAt: itemsFrame.at };
        });
        samples.push({
          mode,
          move,
          messageBytes: bytesSince(beforeMove),
          wireBytes: wireBytes - wireBeforeMove,
          resent: Number(await page.getByTestId("resent").textContent()),
          totalMs: timing.appliedAt - timing.startedAt,
          untilItemsFrameMs: timing.itemsFrameAt - timing.startedAt,
        });
      }
      assert(
        (await itemCount()) === 1000,
        `round ${round + 1} ${mode}: ${movesPerRound} moves applied, still 1,000 items`,
      );
    }
  }

  console.log(`\nWebSocket extensions negotiated: ${JSON.stringify(handshakes)}`);
  console.log(
    `Samples per mode: ${rounds} page loads, ${rounds * movesPerRound} moves. Values are median (min to max).\n`,
  );
  for (const mode of modes) {
    const own = samples.filter((sample) => sample.mode === mode);
    console.log(`mode=${mode}`);
    console.log(
      `  to open the canvas: ${summary(loads[mode].messageBytes)} message bytes, ${summary(loads[mode].wireBytes)} wire bytes`,
    );
    for (const move of [1, movesPerRound]) {
      const atMove = own.filter((sample) => sample.move === move);
      console.log(
        `  move ${move} of a session: ${summary(atMove.map((s) => s.messageBytes))} message bytes, ${summary(atMove.map((s) => s.wireBytes))} wire bytes, ${summary(atMove.map((s) => s.resent))} items resent`,
      );
    }
    console.log(
      `  ms from mutation call to updated items in React: ${summary(
        own.map((s) => s.totalMs),
        1,
      )}`,
    );
    console.log(
      `    of which until the frame with the items arrived: ${summary(
        own.map((s) => s.untilItemsFrameMs),
        1,
      )}`,
    );
    console.log(
      `    of which from that frame to React: ${summary(
        own.map((s) => s.totalMs - s.untilItemsFrameMs),
        1,
      )}`,
    );
  }

  console.log("\nServer side, from `convex logs` for this run. Cached results are left out.");
  for (const [name, calls] of await serverCalls(runStartedAt)) {
    console.log(
      `  ${name}: ${calls.length} calls, ${summary(
        calls.map((call) => call.ms),
        0,
      )} ms, ${summary(calls.map((call) => call.documentsRead))} documents read, ${summary(calls.map((call) => call.bytesRead))} bytes read`,
    );
  }
} finally {
  await browser.close();
  forwarder.close();
}
