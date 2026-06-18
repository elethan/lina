import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

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

// ── Pre-paint toolbar setter (SSR-safe) ───────────────────────
/**
 * Sets toolbar content before paint on the client to avoid a visible
 * empty-toolbar frame while preserving SSR compatibility.
 */
export function useSetToolbar(config: ToolbarState) {
    const { setToolbar } = useToolbar()

    // Use useEffect so the toolbar skeleton can paint first,
    // then content fills in without blocking the initial render.
    useEffect(() => {
        setToolbar(config)
    }, [config, setToolbar])
}
