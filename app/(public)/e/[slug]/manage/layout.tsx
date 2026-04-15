import { redirect, notFound } from "next/navigation"
import { getManageHackathon } from "@/lib/services/manage-hackathon"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function ManageLayout({ children, params }: LayoutProps) {
  const { slug } = await params
  const result = await getManageHackathon(slug)

  if (!result.ok) {
    if (result.reason === "unauthenticated") {
      redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/manage`)}`)
    }
    notFound()
  }

  return <div className="p-4 md:p-6">{children}</div>
}
