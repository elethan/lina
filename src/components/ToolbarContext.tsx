import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// ── Types ─────────────────────────────────────────────────────
export type ToolbarState = {
    title: string
    /** Content rendered on the LEFT side (search, filters, etc.) */
    leftContent: ReactNode
    /** Content rendered on the RIGHT side (action buttons, dropdowns, etc.) */
    rightContent: ReactNode
}

type ToolbarContextValue = ToolbarState & {
    setToolbar: (state: Partial<ToolbarState>) => void
}

const EMPTY_TOOLBAR: ToolbarState = { title: '', leftContent: null, rightContent: null }

// ── Context ───────────────────────────────────────────────────
const ToolbarContext = createContext<ToolbarContextValue | null>(null)

export function ToolbarProvider({ children }: { children: ReactNode }) {
    const [toolbar, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR)

    const setToolbar = useCallback((update: Partial<ToolbarState>) => {
        setToolbarState((prev) => ({ ...prev, ...update }))
    }, [])

    return (
        <ToolbarContext.Provider value={{ ...toolbar, setToolbar }}>
            {children}
        </ToolbarContext.Provider>
    )
}

export function useToolbar() {
    const ctx = useContext(ToolbarContext)
    if (!ctx) throw new Error('useToolbar must be used within a ToolbarProvider')
    return ctx
}

// ── Synchronous toolbar setter (SSR-safe) ─────────────────────
/**
 * Sets toolbar content synchronously during render so it's available
 * on the very first frame — including SSR. Cleans up on unmount.
 */
export function useSetToolbar(config: ToolbarState) {
    const { setToolbar } = useToolbar()
    const prev = useRef<string | null>(null)

    // Build a stable key from the serialisable parts of config
    const key = config.title

    // Set toolbar synchronously during render when config changes
    if (prev.current !== key) {
        prev.current = key
        setToolbar(config)
    }

    // Always push latest config (covers reactive content like counts)
    useEffect(() => {
        setToolbar(config)
    })

    // Cleanup on unmount — reset toolbar to empty
    useEffect(() => {
        return () => setToolbar(EMPTY_TOOLBAR)
    }, [setToolbar])
}
