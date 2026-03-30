import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

type ToolbarProps = {
    leftContent?: ReactNode
    rightContent?: ReactNode
}

export default function Toolbar({ leftContent = null, rightContent = null }: ToolbarProps) {
    const isNavigating = useRouterState({
        select: (state) => state.status === 'pending',
    })

    return (
        <header className="sticky top-0 z-10 flex items-center gap-4 px-6 h-16 bg-white/90 backdrop-blur-md border-b border-gray-200 relative overflow-hidden">
            {isNavigating && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent">
                    <div className="h-full w-full bg-primary/70 animate-pulse" />
                </div>
            )}

            {/* Data components — fill available space, left-aligned */}
            <div className="flex items-center gap-4 flex-1">
                {leftContent ? (
                    leftContent
                ) : (
                    <div className="flex items-center gap-3 w-full">
                        <div className="h-8 w-40 rounded-md bg-gray-200 animate-pulse" />
                        <div className="h-8 w-28 rounded-md bg-gray-200 animate-pulse" />
                    </div>
                )}
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
