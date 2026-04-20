import { ShowcaseShell } from "./showcase-shell"

const VALID_TABS = ["core", "forms", "overlays", "data", "dates", "nav", "advanced"]

export default async function ComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const active = tab && VALID_TABS.includes(tab) ? tab : "core"

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Component library</h1>
        <p className="text-sm text-muted-foreground">
          Every piece we use, in one place. Poke at them to see how they behave.
        </p>
      </div>
      <ShowcaseShell value={active} />
    </div>
  )
}
