import { Skeleton } from "@/components/ui/skeleton"

export default function JudgingLoading() {
  return <div className="space-y-6" aria-label="Loading judging"><div className="grid gap-4 sm:grid-cols-3">{[0,1,2].map((item) => <Skeleton key={item} className="h-36 w-full" />)}</div><Skeleton className="h-72 w-full" /></div>
}
