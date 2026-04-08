import { useRouterState } from '@tanstack/react-router'
import { useToolbar } from './ToolbarContext'

export default function Toolbar() {
    const { leftContent, rightContent } = useToolbar()
    const isNavigating = useRouterState({
        select: (state) => state.status === 'pending',
    })

    return (
        <header className="sticky top-0 z-10 flex items-center gap-4 px-6 h-16 shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-200 relative overflow-hidden">
            {isNavigating && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent">
                    <div className="h-full w-full bg-primary/70 animate-pulse" />
                </div>
            )}

            {/* Data components — fill available space, left-aligned */}
            <div className="flex items-center gap-4 flex-1">
                {leftContent}
            </div>

            {/* Action buttons — pinned to the right */}
            {rightContent && (
                <div className="flex items-center gap-2 shrink-0">
                    {rightContent}
                </div>
            )}
        </header>
    )
}
