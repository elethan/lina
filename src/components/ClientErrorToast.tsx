import { useEffect, useState } from 'react'
import {
  subscribeClientErrorNotices,
  type ClientErrorNotice,
} from '../lib/client-error-logger'

const AUTO_DISMISS_MS = 6000
const MAX_VISIBLE = 3

export default function ClientErrorToast() {
  const [notices, setNotices] = useState<ClientErrorNotice[]>([])

  useEffect(() => {
    const timeouts = new Map<number, ReturnType<typeof setTimeout>>()

    const unsubscribe = subscribeClientErrorNotices((notice) => {
      setNotices((prev) => [...prev, notice].slice(-MAX_VISIBLE))

      const timeoutId = setTimeout(() => {
        setNotices((prev) => prev.filter((n) => n.id !== notice.id))
        timeouts.delete(notice.id)
      }, AUTO_DISMISS_MS)

      timeouts.set(notice.id, timeoutId)
    })

    return () => {
      unsubscribe()
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId))
      timeouts.clear()
    }
  }, [])

  if (notices.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 shadow-sm"
        >
          <p className="text-sm font-semibold text-red-800">{notice.title}</p>
          <p className="mt-0.5 text-xs text-red-700">{notice.message}</p>
        </div>
      ))}
    </div>
  )
}
