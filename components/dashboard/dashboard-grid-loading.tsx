import { Skeleton } from "@/components/ui/skeleton"

type DashboardGridLoadingProps = {
  statCards?: number
  cardCount?: number
  showSearch?: boolean
  showProgress?: boolean
}

export function DashboardGridLoading({
  statCards = 4,
  cardCount = 6,
  showSearch = false,
  showProgress = false,
}: DashboardGridLoadingProps) {
  return (
    <div className="space-y-6" aria-label="Loading">
      {showSearch && <Skeleton className="h-9 w-full sm:w-64" />}

      {statCards > 0 && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-lg border p-4">
              <Skeleton className="size-10" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {showProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-6" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cardCount }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
