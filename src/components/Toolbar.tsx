import { useToolbar } from './ToolbarContext'

export default function Toolbar() {
    const { title, leftContent, rightContent } = useToolbar()

    return (
        <header className="sticky top-0 z-10 flex items-center gap-4 px-6 h-14 bg-white/90 backdrop-blur-md border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-900 mr-4">{title}</h1>

            {/* Left side: search, filters, etc. */}
            {leftContent}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right side: action buttons */}
            {rightContent && (
                <div className="flex items-center gap-2">
                    {rightContent}
                </div>
            )}
        </header>
    )
}
