import { FileSearch } from 'lucide-react'

interface EmptyStateProps {
    title?: string
    description?: string
    icon?: React.ReactNode
}

export function EmptyState({
    title = "No Results",
    description = "Configure your scan settings on the left and run a comparison to see results here.",
    icon
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
            <div className="text-muted-foreground mb-4">
                {icon || <FileSearch className="h-16 w-16" />}
            </div>
            <h3 className="text-xl font-semibold mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-md">{description}</p>
        </div>
    )
}
