export default function TableSkeleton({ rows = 9 }: { rows?: number }) {
    return (
        <div className="flex flex-col flex-1 overflow-hidden px-4 py-3 gap-2">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2 rounded-lg">
                <div className="h-3 w-5 rounded bg-gray-200 shrink-0" />
                <div className="h-3 w-12 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
                <div className="h-3 w-28 rounded bg-gray-200" />
                <div className="h-3 flex-1 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-200" />
            </div>
            {/* Body rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg bg-white border border-gray-100"
                >
                    <div className="h-4 w-5 rounded bg-gray-100 shrink-0" />
                    <div className="h-4 w-12 rounded bg-gray-100" />
                    <div className="h-4 w-20 rounded bg-gray-100" />
                    <div className="h-4 w-28 rounded bg-gray-100" />
                    <div className="h-4 flex-1 rounded bg-gray-100" />
                    <div className="h-4 w-20 rounded bg-gray-100" />
                    <div className="h-4 w-24 rounded bg-gray-100" />
                    <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
            ))}
        </div>
    )
}
