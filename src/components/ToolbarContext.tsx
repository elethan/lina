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
 * Sets toolbar content during render so it's available on the very
 * first frame — including SSR.  Accepts a *memoised* ToolbarState
 * (callers should wrap their config in useMemo) and syncs it into
 * the context only when the reference changes, preventing infinite
 * re-render loops.
 */
export function useSetToolbar(config: ToolbarState) {
    const { setToolbar } = useToolbar()
    const configRef = useRef<ToolbarState>(config)

    // Keep the ref pointing at the latest config for the cleanup closure
    configRef.current = config

    // Sync config into context whenever the memoised reference changes
    useEffect(() => {
        setToolbar(config)
    }, [config, setToolbar])

    // Cleanup on unmount — reset toolbar to empty
    useEffect(() => {
        return () => setToolbar(EMPTY_TOOLBAR)
    }, [setToolbar])
}
