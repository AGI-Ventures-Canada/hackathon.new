"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import {
  createJudgeWebMcpTools,
  type JudgeEditorInfo,
  type JudgePreparation,
  type JudgeWebMcpAssignment,
} from "@/lib/webmcp/judge-tools"

export const JUDGE_WEBMCP_OPEN_EVENT = "oatmeal:webmcp:open-judge-assignment"

type JudgeEditor = {
  info: JudgeEditorInfo
  prepare: (preparation: JudgePreparation) => { prepared: boolean; message: string }
}

type JudgeWebMcpRegistry = {
  registerEditor: (assignmentIds: string[], editor: JudgeEditor) => () => void
}

const JudgeWebMcpContext = createContext<JudgeWebMcpRegistry | null>(null)

function mutableValue<T>(initialValue: T) {
  let value = initialValue
  return {
    get: () => value,
    set: (nextValue: T) => {
      value = nextValue
    },
  }
}

type JudgeWebMcpToolsProps = {
  slug: string
  assignments: JudgeWebMcpAssignment[]
  enabled?: boolean
  children: ReactNode
}

export function JudgeWebMcpTools({
  slug,
  assignments,
  enabled = true,
  children,
}: JudgeWebMcpToolsProps) {
  const [editors] = useState(() => new Map<string, JudgeEditor>())
  const [assignmentStore] = useState(() => mutableValue(assignments))
  const styleKey = Array.from(
    new Set(assignments.map((assignment) => assignment.judgingStyle)),
  ).sort().join(":")

  useEffect(() => {
    assignmentStore.set(assignments)
  }, [assignments, assignmentStore])

  const registerEditor = useCallback((assignmentIds: string[], editor: JudgeEditor) => {
    for (const assignmentId of assignmentIds) editors.set(assignmentId, editor)
    return () => {
      for (const assignmentId of assignmentIds) {
        if (editors.get(assignmentId) === editor) editors.delete(assignmentId)
      }
    }
  }, [editors])

  const tools = useMemo(
    () =>
      enabled ? createJudgeWebMcpTools({
        slug,
        assignments: assignmentStore.get,
        availableStyles: styleKey
          ? styleKey.split(":") as JudgeWebMcpAssignment["judgingStyle"][]
          : [],
        getEditorInfo: (assignmentId) => editors.get(assignmentId)?.info ?? null,
        onOpen: (assignmentId) => {
          window.dispatchEvent(
            new CustomEvent(JUDGE_WEBMCP_OPEN_EVENT, { detail: { assignmentId } }),
          )
          requestAnimationFrame(() => {
            const assignment = Array.from(
              document.querySelectorAll<HTMLElement>("[data-judge-assignment]"),
            ).find((element) => element.dataset.judgeAssignment === assignmentId)
            assignment?.scrollIntoView({ behavior: "smooth", block: "center" })
          })
        },
        onPrepare: (assignmentId, preparation) => {
          const editor = editors.get(assignmentId)
          if (!editor) {
            return { prepared: false, message: "Open this project, then try again." }
          }
          return editor.prepare(preparation)
        },
      }) : [],
    [assignmentStore, editors, enabled, slug, styleKey],
  )

  useWebMcpTools(tools)

  const registry = useMemo(() => ({ registerEditor }), [registerEditor])

  return (
    <JudgeWebMcpContext.Provider value={registry}>
      {children}
    </JudgeWebMcpContext.Provider>
  )
}

export function useJudgeWebMcpEditor(
  assignmentIds: string[],
  editor: JudgeEditor | null,
) {
  const registry = useContext(JudgeWebMcpContext)
  const assignmentKey = assignmentIds.join(":")

  useEffect(() => {
    if (!registry || !editor || assignmentIds.length === 0) return
    return registry.registerEditor(assignmentIds, editor)
  }, [assignmentIds, assignmentKey, editor, registry])
}
