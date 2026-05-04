import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { HeaderLogo } from "@/components/public/header-logo"
import { HeaderAuth } from "@/components/public/header-auth"
import { HomepageHero } from "@/components/homepage-hero"

export default async function Home() {
  const { userId } = await auth()

  if (userId) {
    redirect("/home")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeaderLogo />
          </div>
          <nav className="flex items-center gap-2">
            <HeaderAuth />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <HomepageHero />
      </main>
    </div>
  )
}
