import { redirect } from "next/navigation"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function PrizesPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/e/${slug}/manage/judging/settings?edit=prizes`)
}
