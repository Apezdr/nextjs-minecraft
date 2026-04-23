import type { NextRequest } from 'next/server'
import { status } from 'minecraft-server-util'

// Only allow valid hostnames/IPs with optional port — prevents SSRF/injection
const VALID_HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,251}[a-zA-Z0-9])?(?::\d{1,5})?$/

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('ip')?.trim()

  if (!raw || !VALID_HOST_RE.test(raw)) {
    return Response.json({ error: 'Invalid server address' }, { status: 400 })
  }

  const [host, portStr] = raw.split(':')
  const port = portStr ? parseInt(portStr, 10) : 25565

  if (isNaN(port) || port < 1 || port > 65535) {
    return Response.json({ error: 'Invalid port' }, { status: 400 })
  }

  try {
    const result = await status(host, port, { timeout: 5000 })
    return Response.json({ online: true, ...result })
  } catch {
    return Response.json({ online: false })
  }
}
