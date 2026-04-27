import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"

type JudgeWithPrizeIds = {
  participantId: string
  prizeIds: string[]
}

export function usePrizeJudgeAssignments<T extends JudgeWithPrizeIds>({
  hackathonId,
  judges,
}: {
  hackathonId: string
  judges: T[]
}) {
  const router = useRouter()
  const [addedPrizeJudges, setAddedPrizeJudges] = useState<Set<string>>(new Set())
  const [hiddenPrizeJudges, setHiddenPrizeJudges] = useState<Set<string>>(new Set())
  const [prevJudges, setPrevJudges] = useState(judges)

  if (judges !== prevJudges) {
    setPrevJudges(judges)

    if (addedPrizeJudges.size > 0) {
      const next = new Set<string>()
      for (const key of addedPrizeJudges) {
        const [pid, jid] = key.split(":")
        const judge = judges.find((j) => j.participantId === jid)
        if (judge && !judge.prizeIds.includes(pid)) next.add(key)
      }
      if (next.size !== addedPrizeJudges.size) setAddedPrizeJudges(next)
    }

    if (hiddenPrizeJudges.size > 0) {
      const next = new Set<string>()
      for (const key of hiddenPrizeJudges) {
        const [pid, jid] = key.split(":")
        const judge = judges.find((j) => j.participantId === jid)
        if (judge && judge.prizeIds.includes(pid)) next.add(key)
      }
      if (next.size !== hiddenPrizeJudges.size) setHiddenPrizeJudges(next)
    }
  }

  const optimisticJudges = useMemo(
    () =>
      judges.map((j) => {
        const serverPrizeIds = j.prizeIds.filter(
          (pid) => !hiddenPrizeJudges.has(`${pid}:${j.participantId}`),
        )
        const addedPrizeIds: string[] = []
        for (const key of addedPrizeJudges) {
          const [pid, jid] = key.split(":")
          if (jid === j.participantId && !serverPrizeIds.includes(pid)) {
            addedPrizeIds.push(pid)
          }
        }
        return {
          ...j,
          prizeIds:
            addedPrizeIds.length === 0
              ? serverPrizeIds
              : [...serverPrizeIds, ...addedPrizeIds],
        }
      }),
    [judges, hiddenPrizeJudges, addedPrizeJudges],
  )

  async function assignJudgeToPrize(prizeId: string, judgeParticipantId: string) {
    const key = `${prizeId}:${judgeParticipantId}`
    setAddedPrizeJudges((prev) => new Set(prev).add(key))
    setHiddenPrizeJudges((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign-judge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ judgeParticipantId }),
        },
      ).then(assertOk)
      router.refresh()
    } catch (err) {
      setAddedPrizeJudges((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      throw err
    }
  }

  async function unassignJudgeFromPrize(prizeId: string, judgeParticipantId: string) {
    const key = `${prizeId}:${judgeParticipantId}`
    setHiddenPrizeJudges((prev) => new Set(prev).add(key))
    setAddedPrizeJudges((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/judges/${judgeParticipantId}`,
        { method: "DELETE" },
      ).then(assertOk)
      router.refresh()
    } catch (err) {
      setHiddenPrizeJudges((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      throw err
    }
  }

  return { optimisticJudges, assignJudgeToPrize, unassignJudgeFromPrize }
}
