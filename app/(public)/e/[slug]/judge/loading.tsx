import { Skeleton } from "@/components/ui/skeleton"

export default function JudgeWorkspaceLoading() {
  return <div className="space-y-6 p-4 md:p-6"><h1 className="text-2xl font-semibold">Your judging workspace</h1><Skeleton className="h-36 w-full" /><div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"><Skeleton className="h-64 w-full" /><Skeleton className="h-96 w-full" /></div></div>
}
