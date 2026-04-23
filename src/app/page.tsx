import Image from 'next/image'
import { status as pingServer } from 'minecraft-server-util'
import BgIframe from '@/components/BgIframe'
import AutoRefresh from '@/components/AutoRefresh'

// Never statically pre-render — pingServer() is a raw TCP call that Next.js
// can't detect as dynamic, so without this the build-time result gets frozen.
export const dynamic = 'force-dynamic'

const SERVER_HOST = process.env.MC_SERVER_HOST ?? ''
const SERVER_PORT = parseInt(process.env.MC_SERVER_PORT ?? '25565', 10)
const BLUEMAP_URL = process.env.BLUEMAP_URL ?? null
const BLUEMAP_PUBLIC_URL = process.env.BLUEMAP_PUBLIC_URL ?? null
const BLUEMAP_CENTER_X = parseInt(process.env.BLUEMAP_CENTER_X ?? '0', 10)
const BLUEMAP_CENTER_Z = parseInt(process.env.BLUEMAP_CENTER_Z ?? '0', 10)
const BLUEMAP_ZOOM = parseInt(process.env.BLUEMAP_ZOOM ?? '1000', 10)
// Pipe-separated list of background URLs; falls back to legacy BLUEMAP_BG_URL
const BLUEMAP_BG_URLS: string[] = (process.env.BLUEMAP_BG_URLS ?? process.env.BLUEMAP_BG_URL ?? '')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean)
const BLUEMAP_BG_SLIDESHOW_INTERVAL = parseInt(process.env.BLUEMAP_BG_SLIDESHOW_INTERVAL ?? '15000', 10)
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL ?? '3000', 10)

interface McServerStatus {
  online: boolean
  version?: { name: string; protocol: number }
  players?: {
    online: number
    max: number
    sample: { name: string; id: string }[] | null
  }
  motd?: { raw: string; clean: string; html: string }
  favicon?: string | null
  roundTripLatency?: number
}

interface BlueMapPlayer {
  uuid: string
  name: string
  foreign: boolean
  position: { x: number; y: number; z: number }
  world: string
}

interface BlueMapData {
  players: Map<string, BlueMapPlayer>
  iframeUrl: string | null
}

async function fetchServerStatus(): Promise<McServerStatus> {
  try {
    const result = await pingServer(SERVER_HOST, SERVER_PORT, { timeout: 5000 })
    return { online: true, ...result }
  } catch {
    return { online: false }
  }
}

async function fetchBlueMapData(): Promise<BlueMapData> {
  const empty: BlueMapData = { players: new Map(), iframeUrl: BLUEMAP_PUBLIC_URL }
  if (!BLUEMAP_URL) return empty
  try {
    const settingsRes = await fetch(`${BLUEMAP_URL}/settings.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!settingsRes.ok) return empty
    const settings = await settingsRes.json()
    const maps: string[] = settings.maps ?? ['world']
    const liveDataRoot: string = settings.liveDataRoot ?? 'maps'
    const firstMapId = maps[0] ?? 'world'

    // Flat overhead view centered on the configured coordinates.
    // ortho=1 + state=flat = 2D top-down; distance 1000 loads lowres tiles.
    const iframeUrl = BLUEMAP_PUBLIC_URL
      ? withEmbedParam(`${BLUEMAP_PUBLIC_URL}#${firstMapId}:${BLUEMAP_CENTER_X}:64:${BLUEMAP_CENTER_Z}:${BLUEMAP_ZOOM}:0:0:0:1:flat`)
      : null

    // Fetch live players from all maps
    const playerMap = new Map<string, BlueMapPlayer>()
    await Promise.all(
      maps.map(async (mapId) => {
        try {
          const res = await fetch(
            `${BLUEMAP_URL}/${liveDataRoot}/${mapId}/live/players.json`,
            { cache: 'no-store', signal: AbortSignal.timeout(3000) },
          )
          if (!res.ok) return
          const data = await res.json()
          if (Array.isArray(data.players)) {
            for (const p of data.players as BlueMapPlayer[]) {
              if (!p.foreign) playerMap.set(p.uuid, { ...p, world: mapId })
            }
          }
        } catch { /* map unavailable */ }
      }),
    )

    return { players: playerMap, iframeUrl }
  } catch {
    return empty
  }
}

/** Appends query params before the # hash fragment. */
function withParams(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  const idx = url.indexOf('#')
  if (idx === -1) return `${url}?${qs}`
  return `${url.slice(0, idx)}?${qs}${url.slice(idx)}`
}

/** Appends ?embed=1 before the # so BlueMap hides its UI chrome in the widget. */
function withEmbedParam(url: string): string {
  return withParams(url, { embed: '1' })
}

function formatWorld(world: string | undefined): string {
  if (!world) return 'Unknown'
  // Strip namespace prefix (e.g. "minecraft:overworld" -> "overworld")
  const name = world.includes(':') ? world.split(':').pop()! : world
  const known: Record<string, string> = {
    world: 'Overworld',
    overworld: 'Overworld',
    world_nether: 'Nether',
    the_nether: 'Nether',
    world_the_end: 'The End',
    the_end: 'The End',
  }
  return known[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function PlayerBar({ online, max }: { online: number; max: number }) {
  const pct = max > 0 ? Math.min((online / max) * 100, 100) : 0
  const color =
    pct < 50 ? 'bg-green-500' : pct < 80 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-sm">
        <span className="text-zinc-400">Players</span>
        <span className="text-zinc-100">
          <span className="text-green-400">{online.toLocaleString()}</span>
          <span className="text-zinc-500"> / {max.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Motd({ html }: { html: string }) {
  // Strip any scripts or inline event handlers before rendering
  const safe = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
  return (
    <p
      className="font-mono text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
}

export default async function Home() {
  const [status, blueMapData] = await Promise.all([
    fetchServerStatus(),
    fetchBlueMapData(),
  ])

  const isOnline = status.online
  const motdHtml = status.motd?.html ?? ''
  const playerList = status.players?.sample?.slice(0, 16) ?? []
  const blueMapPlayers = blueMapData.players
  const { iframeUrl } = blueMapData

  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 py-16 font-mono" style={{ zIndex: 2, position: 'relative' }}>
      <AutoRefresh intervalMs={REFRESH_INTERVAL} />
      {/* Cinematic background map — portaled into document.body, identical to iframe-test.html */}
      {BLUEMAP_BG_URLS.length > 0 && (
        <BgIframe
          srcs={BLUEMAP_BG_URLS.map((url) => withParams(url, { embed: '1', night: '1' })).join('|')}
          slideshowIntervalMs={BLUEMAP_BG_SLIDESHOW_INTERVAL}
        />
      )}
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="mb-1 text-4xl font-black tracking-tight text-white">
          <span className="text-green-400">⛏</span> Minecraft Server Status
        </h1>
      </div>

      {/* Status Card */}
      <div className="w-full max-w-xl rounded-lg border-2 border-[#333] bg-[#1e1e1ecc] shadow-xl">
        {/* Card header */}
        <div className="flex items-center gap-4 border-b-2 border-[#333] px-6 py-4">
          {status.favicon ? (
            <Image
              src={status.favicon}
              alt={`${SERVER_HOST} server icon`}
              width={64}
              height={64}
              className="rounded"
              unoptimized
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-[#2a2a2a] text-3xl">
              🎮
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-bold text-zinc-100">{SERVER_HOST}</span>
            </div>
            {status.version && (
              <p className="text-xs text-zinc-500">{status.version.name}</p>
            )}
          </div>
          <div
            className={`shrink-0 rounded px-3 py-1 text-xs font-bold ${
              isOnline
                ? 'bg-green-900/60 text-green-400'
                : 'bg-red-900/60 text-red-400'
            }`}
          >
            {isOnline ? '● ONLINE' : '● OFFLINE'}
          </div>
        </div>

        {/* Card body */}
        <div className="space-y-5 px-6 py-5">
          {motdHtml ? (
            <div className="rounded bg-[#141414] px-4 py-3">
              <Motd html={motdHtml} />
            </div>
          ) : (
            <div className="rounded bg-[#141414] px-4 py-3 text-sm italic text-zinc-600">
              {isOnline ? 'No MOTD.' : 'Could not reach server.'}
            </div>
          )}

          {isOnline && status.players ? (
            <PlayerBar
              online={status.players.online}
              max={status.players.max}
            />
          ) : null}

          {playerList.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">
                Online Players
              </p>
              <div className="flex flex-wrap gap-2">
                {playerList.map((p) => {
                  const bm = blueMapPlayers?.get(p.id)
                  return (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 rounded bg-[#2a2a2a] px-2 py-0.5 text-xs text-zinc-300"
                    >
                      {p.name}
                      {bm && (
                        <span className="text-zinc-600">{formatWorld(bm.world)}</span>
                      )}
                    </span>
                  )
                })}
                {(status.players?.online ?? 0) > 16 && (
                  <span className="rounded bg-[#2a2a2a] px-2 py-0.5 text-xs text-zinc-500">
                    +{(status.players!.online - 16).toLocaleString()} more
                  </span>
                )}
              </div>
            </div>
          )}

          {isOnline && status.roundTripLatency !== undefined && (
            <p className="text-xs text-zinc-600">
              Latency: <span className="text-zinc-400">{status.roundTripLatency} ms</span>
            </p>
          )}
        </div>

        {BLUEMAP_PUBLIC_URL && (
          <div className="border-t-2 border-[#333] px-6 py-3">
            <a
              href={BLUEMAP_PUBLIC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 transition-colors hover:text-green-400"
            >
              🗺 Open Full Map ↗
            </a>
          </div>
        )}
      </div>

      {/* BlueMap Embed */}
      {iframeUrl && (
        <div className="mt-6 w-full max-w-xl overflow-hidden rounded-lg border-2 border-[#333] shadow-xl">
          <div className="flex items-center justify-between border-b-2 border-[#333] bg-[#1e1e1ecc] px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              🗺 Live Map
            </span>
            <a
              href={BLUEMAP_PUBLIC_URL!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 transition-colors hover:text-green-400"
            >
              Open full map ↗
            </a>
          </div>
          {/* Wrapper makes the whole map area a click target while blocking
              drag interactions that pan into unrendered (black) chunks */}
          <a
            href={BLUEMAP_PUBLIC_URL!}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block"
            aria-label="Open full interactive map"
          >
            <iframe
              src={iframeUrl}
              className="h-[560px] w-full"
              title="BlueMap Live View"
              style={{ pointerEvents: 'none' }}
              allowFullScreen
            />
            <div className="absolute inset-0 flex items-end justify-center bg-transparent pb-6 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded bg-black/70 px-3 py-1.5 text-xs font-bold text-green-400">
                Click to open interactive map ↗
              </span>
            </div>
          </a>
        </div>
      )}
    </div>
  )
}


