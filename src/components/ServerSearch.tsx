'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

export default function ServerSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = inputRef.current?.value.trim()
    if (val) {
      router.push(`/?server=${encodeURIComponent(val)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-2">
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder="play.hypixel.net"
        spellCheck={false}
        autoCapitalize="none"
        className="flex-1 rounded border-2 border-[#555] bg-[#1a1a1a] px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-[#4a9f3e] transition-colors"
      />
      <button
        type="submit"
        className="rounded border-2 border-[#4a9f3e] bg-[#2d6b24] px-5 py-2.5 font-mono text-sm font-bold text-white transition-colors hover:bg-[#3a8a2e] active:bg-[#256120]"
      >
        Check
      </button>
    </form>
  )
}
