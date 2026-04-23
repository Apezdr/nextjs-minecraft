'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const FADE_MS = 1500 // must match CSS transition duration below

export default function BgIframe({
  srcs: srcsProp,
  slideshowIntervalMs,
}: {
  srcs: string
  slideshowIntervalMs: number
}) {
  const srcs = useMemo(() => srcsProp.split('|').filter(Boolean), [srcsProp])

  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  // ready: initial BlueMap load complete; transitioning: overlay fading for a slide swap
  const [ready, setReady] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const indexRef = useRef(0)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (!ready || srcs.length <= 1) return
    const pending: ReturnType<typeof setTimeout>[] = []

    const id = setInterval(() => {
      // 1. Fade overlay to fully opaque
      setTransitioning(true)
      // 2. Once fully opaque, swap the src
      const t1 = setTimeout(() => {
        indexRef.current = (indexRef.current + 1) % srcs.length
        setCurrentIndex(indexRef.current)
        // 3. Brief pause then fade back in (optimistic — don't wait for load)
        const t2 = setTimeout(() => setTransitioning(false), 500)
        pending.push(t2)
      }, FADE_MS)
      pending.push(t1)
    }, slideshowIntervalMs)

    return () => {
      clearInterval(id)
      pending.forEach(clearTimeout)
    }
  }, [ready, srcs, slideshowIntervalMs])

  if (!mounted) return null

  const handleLoad = () => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    setTimeout(() => setReady(true), 2000)
  }

  const overlayOpaque = !ready || transitioning

  return createPortal(
    <>
      <iframe
        src={srcs[currentIndex]}
        onLoad={handleLoad}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        title="Background Map"
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'black',
          zIndex: 1,
          pointerEvents: 'none',
          opacity: overlayOpaque ? 1 : 0.5,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      />
    </>,
    document.body,
  )
}
