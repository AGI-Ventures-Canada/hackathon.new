import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"

type JudgeWithPrizeIds = {
  participantId: string
  prizeIds: string[]
}

const KEY_DELIMITER = ":"

function makeKey(prizeId: string, judgeParticipantId: string) {
  return `${prizeId}${KEY_DELIMITER}${judgeParticipantId}`
}

function parseKey(key: string): { prizeId: string; judgeParticipantId: string } {
  const idx = key.indexOf(KEY_DELIMITER)
  return {
    prizeId: key.slice(0, idx),
    judgeParticipantId: key.slice(idx + KEY_DELIMITER.length),
  }
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
  const addedRef = useRef(addedPrizeJudges)
  const hiddenRef = useRef(hiddenPrizeJudges)
  useEffect(() => {
    addedRef.current = addedPrizeJudges
  }, [addedPrizeJudges])
  useEffect(() => {
    hiddenRef.current = hiddenPrizeJudges
  }, [hiddenPrizeJudges])
  const [prevJudges, setPrevJudges] = useState(judges)

  if (judges !== prevJudges) {
    setPrevJudges(judges)

    if (addedPrizeJudges.size > 0) {
      const next = new Set<string>()
      for (const key of addedPrizeJudges) {
        const { prizeId, judgeParticipantId } = parseKey(key)
        const judge = judges.find((j) => j.participantId === judgeParticipantId)
        if (judge && !judge.prizeIds.includes(prizeId)) next.add(key)
      }
      if (next.size !== addedPrizeJudges.size) setAddedPrizeJudges(next)
    }

    if (hiddenPrizeJudges.size > 0) {
      const next = new Set<string>()
      for (const key of hiddenPrizeJudges) {
        const { prizeId, judgeParticipantId } = parseKey(key)
        const judge = judges.find((j) => j.participantId === judgeParticipantId)
        if (judge && judge.prizeIds.includes(prizeId)) next.add(key)
      }
      if (next.size !== hiddenPrizeJudges.size) setHiddenPrizeJudges(next)
    }
  }

  const optimisticJudges = useMemo(
    () =>
      judges.map((j) => {
        const serverPrizeIds = j.prizeIds.filter(
          (pid) => !hiddenPrizeJudges.has(makeKey(pid, j.participantId)),
        )
        const addedPrizeIds: string[] = []
        for (const key of addedPrizeJudges) {
          const { prizeId, judgeParticipantId } = parseKey(key)
          if (
            judgeParticipantId === j.participantId &&
            !serverPrizeIds.includes(prizeId)
          ) {
            addedPrizeIds.push(prizeId)
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

  const assignJudgeToPrize = useCallback(
    async (prizeId: string, judgeParticipantId: string) => {
      const key = makeKey(prizeId, judgeParticipantId)
      const wasHidden = hiddenRef.current.has(key)
      setAddedPrizeJudges((prev) => new Set(prev).add(key))
      if (wasHidden) {
        setHiddenPrizeJudges((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
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
        if (wasHidden) {
          setHiddenPrizeJudges((prev) => new Set(prev).add(key))
        }
        throw err
      }
    },
    [hackathonId, router],
  )

  const unassignJudgeFromPrize = useCallback(
    async (prizeId: string, judgeParticipantId: string) => {
      const key = makeKey(prizeId, judgeParticipantId)
      const wasAdded = addedRef.current.has(key)
      setHiddenPrizeJudges((prev) => new Set(prev).add(key))
      if (wasAdded) {
        setAddedPrizeJudges((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
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
        if (wasAdded) {
          setAddedPrizeJudges((prev) => new Set(prev).add(key))
        }
        throw err
      }
    },
    [hackathonId, router],
  )

  return { optimisticJudges, assignJudgeToPrize, unassignJudgeFromPrize }
}
