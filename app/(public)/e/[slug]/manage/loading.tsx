import { Skeleton } from "@/components/ui/skeleton"

export default function ManageLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading event workspace">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-24" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-28 lg:col-span-3" />
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}
