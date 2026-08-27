import { redirect } from "next/navigation"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function SponsorsPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/e/${slug}/manage?tab=edit`)
}
