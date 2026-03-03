import { useToolbar } from './ToolbarContext'

export default function Toolbar() {
    const { leftContent, rightContent } = useToolbar()

    return (
        <header className="sticky top-0 z-10 flex items-center gap-4 px-6 h-14 bg-white/90 backdrop-blur-md border-b border-gray-200">
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
