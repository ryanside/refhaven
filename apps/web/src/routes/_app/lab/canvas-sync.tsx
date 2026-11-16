import { QueryResult, useMutation, useQuery } from "@confect/react"
import { api } from "@refhaven/backend/api"
import type { Id } from "@refhaven/backend/id"
import refs from "@refhaven/backend/refs"
import { Button } from "@refhaven/ui/components/button"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useConvex, useQuery as usePlainQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import * as Result from "effect/Result"
import { useEffect, useMemo, useRef, useState } from "react"

const modes = {
  live: "One live query",
  plain: "One live query, plain Convex",
  delta: "Snapshot plus changes",
}
type Mode = keyof typeof modes
type Item = FunctionReturnType<typeof api.canvas.items>[number]

export const Route = createFileRoute("/_app/lab/canvas-sync")({
  validateSearch: (search): { mode: Mode; canvasId?: Id<"canvases"> } => ({
    mode:
      typeof search.mode === "string" && search.mode in modes
        ? (search.mode as Mode)
        : "live",
    ...(typeof search.canvasId === "string"
      ? { canvasId: search.canvasId as Id<"canvases"> }
      : {}),
  }),
  component: CanvasSyncLab,
})

function CanvasSyncLab() {
  const { mode, canvasId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const seed = useMutation(refs.public.canvas.seed)

  return (
    <main className="flex flex-col gap-3 p-6">
      <h1 className="font-medium">Lab: canvas sync</h1>
      <nav className="flex gap-3">
        {Object.entries(modes).map(([key, label]) => (
          <Link
            key={key}
            to="."
            search={(current) => ({ ...current, mode: key as Mode })}
            className={key === mode ? "font-medium" : "underline"}
          >
            {label}
          </Link>
        ))}
      </nav>
      {canvasId === undefined ? (
        <Button
          className="self-start"
          onClick={async () => {
            const created = await seed({ count: 1000 })
            if (Result.isSuccess(created)) {
              await navigate({ search: { mode, canvasId: created.success } })
            }
          }}
        >
          Seed 1,000 items
        </Button>
      ) : mode === "live" ? (
        <LiveItems canvasId={canvasId} />
      ) : mode === "plain" ? (
        <PlainItems canvasId={canvasId} />
      ) : (
        <DeltaItems canvasId={canvasId} />
      )}
    </main>
  )
}

function LiveItems({ canvasId }: { canvasId: Id<"canvases"> }) {
  const result = useQuery(refs.public.canvas.items, { canvasId })
  const items = QueryResult.isSuccess(result) ? result.value : undefined

  return <Readout canvasId={canvasId} items={items} resent={items?.length} />
}

function PlainItems({ canvasId }: { canvasId: Id<"canvases"> }) {
  const items = usePlainQuery(api.canvasPlain.items, { canvasId })

  return <Readout canvasId={canvasId} items={items} resent={items?.length} />
}

function DeltaItems({ canvasId }: { canvasId: Id<"canvases"> }) {
  const convex = useConvex()
  const [snapshot, setSnapshot] =
    useState<FunctionReturnType<typeof api.canvas.itemsSince>>()

  useEffect(() => {
    let current = true
    void convex
      .query(api.canvas.itemsSince, { canvasId, rev: -1 })
      .then((loaded) => {
        if (current) setSnapshot(loaded)
      })
    return () => {
      current = false
    }
  }, [convex, canvasId])

  const result = useQuery(
    refs.public.canvas.itemsSince,
    snapshot ? { canvasId, rev: snapshot.rev } : "skip"
  )
  const changed = QueryResult.isSuccess(result) ? result.value.items : undefined

  const items = useMemo(() => {
    if (!snapshot || !changed) return undefined
    const byKey = new Map(snapshot.items.map((item) => [item.key, item]))
    for (const item of changed) byKey.set(item.key, item)
    return [...byKey.values()]
  }, [snapshot, changed])

  return <Readout canvasId={canvasId} items={items} resent={changed?.length} />
}

function Readout({
  canvasId,
  items,
  resent,
}: {
  canvasId: Id<"canvases">
  items: ReadonlyArray<Item> | undefined
  resent: number | undefined
}) {
  const moveItems = useMutation(refs.public.canvas.moveItems)
  const pending = useRef<{ key: string; x: number; startedAt: number }>(null)
  const [applied, setApplied] = useState({
    moves: 0,
    startedAt: 0,
    appliedAt: 0,
  })

  useEffect(() => {
    const sent = pending.current
    if (!sent || !items) return
    if (items.find((item) => item.key === sent.key)?.x !== sent.x) return
    pending.current = null
    setApplied(({ moves }) => ({
      moves: moves + 1,
      startedAt: sent.startedAt,
      appliedAt: performance.now(),
    }))
  }, [items])

  if (!items) {
    return <p>Loading…</p>
  }

  const target = items[applied.moves % items.length]

  return (
    <div className="flex flex-col gap-2">
      <p>
        <span data-testid="item-count">{items.length}</span> items. The last
        update carried <span data-testid="resent">{resent}</span> items.
      </p>
      <Button
        className="self-start"
        disabled={!target}
        onClick={() => {
          if (!target) return
          const x = target.x + 10
          pending.current = { key: target.key, x, startedAt: performance.now() }
          void moveItems({
            canvasId,
            moves: [{ key: target.key, x, y: target.y }],
          })
        }}
      >
        Move one item
      </Button>
      <p
        data-testid="applied"
        data-moves={applied.moves}
        data-started-at={applied.startedAt}
        data-applied-at={applied.appliedAt}
      >
        {applied.moves} moves applied. The last one took{" "}
        {(applied.appliedAt - applied.startedAt).toFixed(0)} ms.
      </p>
    </div>
  )
}
