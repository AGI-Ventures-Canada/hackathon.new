import Link from "next/link"
import { Button } from "@/components/ui/button"
import { judgingHref } from "@/lib/judging/setup"
import { JudgingNavigation } from "@/components/hackathon/judging/judging-navigation"

export default async function JudgingLayout({children, params}: {children: React.ReactNode; params: Promise<{slug: string}>}) {
  const {slug} = await params
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="link" asChild>
            <Link href={`/e/${slug}/manage?tab=action-items`}>Back to Action Items</Link>
          </Button>
          <h1 className="text-2xl font-semibold">Judging</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href={judgingHref(slug, "settings")}>Judging settings</Link>
        </Button>
      </div>
      <JudgingNavigation slug={slug}>{children}</JudgingNavigation>
    </div>
  )
}
