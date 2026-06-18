import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useToolbar } from './ToolbarContext'

export default function Toolbar() {
    const { leftContent, rightContent } = useToolbar()
    const [isMounted, setIsMounted] = useState(false)
    const isNavigating = useRouterState({
        select: (state) => state.status === 'pending',
    })

    useEffect(() => {
        setIsMounted(true)
    }, [])

    return (
        <header data-slot="toolbar" className="sticky top-0 z-10 flex items-center gap-4 px-6 h-16 shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-200 relative overflow-hidden">
            {isMounted && isNavigating && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent">
                    <div className="h-full w-full bg-primary/70 animate-pulse" />
                </div>
            )}

            {/* Skeleton placeholder — shown while page pushes content */}
            {!leftContent && !rightContent && (
                <div className="flex items-center gap-4 flex-1 animate-pulse">
                    <div className="h-9 flex-1 min-w-64 max-w-sm bg-gray-200 rounded-lg" />
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
                        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
                    </div>
                    <div className="hidden lg:flex items-center gap-2 ml-auto">
                        <div className="h-9 w-20 bg-gray-200 rounded-lg" />
                        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
                        <div className="h-9 w-20 bg-gray-200 rounded-lg" />
                        <div className="h-9 w-20 bg-gray-200 rounded-lg" />
                    </div>
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
