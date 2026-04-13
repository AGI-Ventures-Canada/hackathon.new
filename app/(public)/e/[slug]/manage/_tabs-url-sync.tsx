"use client"

import { createContext, useContext, useCallback, useEffect, useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Tabs } from "@/components/ui/tabs"

const OptimisticTabContext = createContext<string | null>(null)
export function useOptimisticTab() {
  return useContext(OptimisticTabContext)
}

export function TabsUrlSync({
  paramKey,
  value: serverValue,
  className,
  children,
}: {
  paramKey: string
  value: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [optimistic, setOptimistic] = useState(serverValue)
  const [, startTransition] = useTransition()

  const urlValue = searchParams.get(paramKey) ?? serverValue
  useEffect(() => {
    setOptimistic(urlValue)
  }, [urlValue])

  const handleChange = useCallback(
    (next: string) => {
      setOptimistic(next)
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set(paramKey, next)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [paramKey, searchParams, router, pathname, startTransition],
  )

  return (
    <OptimisticTabContext.Provider value={optimistic}>
      <Tabs value={optimistic} onValueChange={handleChange} className={className}>
        {children}
      </Tabs>
    </OptimisticTabContext.Provider>
  )
}
