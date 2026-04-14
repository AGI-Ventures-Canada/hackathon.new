"use client"

import { createContext, useContext, useState, useCallback, useEffect } from "react"

export type EditSection =
  | "name"
  | "dates"
  | "about"
  | "location"
  | "sponsors"
  | "judging"
  | "community"
  | null

// "judging" is intentionally excluded — it uses a full-screen dialog
// (JudgingSetupDialog), not the edit drawer, so it's not part of the
// sequential "Save and Next" flow.
export const SECTION_ORDER: Exclude<EditSection, null>[] = [
  "name",
  "dates",
  "location",
  "sponsors",
  "timeline",
  "community",
  "about",
]

interface EditContextValue {
  activeSection: EditSection
  isEditable: boolean
  editMode: boolean
  setEditMode: (mode: boolean) => void
  openSection: (section: EditSection) => void
  closeDrawer: () => void
}

const EditContext = createContext<EditContextValue | null>(null)

interface EditProviderProps {
  children: React.ReactNode
  isEditable: boolean
  defaultEditMode?: boolean
}

export function EditProvider({ children, isEditable, defaultEditMode = true }: EditProviderProps) {
  const [activeSection, setActiveSection] = useState<EditSection>(null)
  const [editMode, setEditModeState] = useState(defaultEditMode)

  const setEditMode = useCallback((mode: boolean) => {
    setEditModeState(mode)
    if (!mode) {
      setActiveSection(null)
    }
  }, [])

  const openSection = useCallback((section: EditSection) => {
    setActiveSection(section)
  }, [])

  const closeDrawer = useCallback(() => {
    setActiveSection(null)
  }, [])

  useEffect(() => {
    if (!activeSection) return
    const el = document.querySelector(`[data-edit-section="${activeSection}"]`)
    if (el) {
      requestAnimationFrame(() => {
        const input = el.querySelector<HTMLElement>(
          "input:not([type=\"hidden\"]), textarea, select, [contenteditable=\"true\"]"
        )
        if (input) input.focus()
      })
    }
  }, [activeSection])

  return (
    <EditContext.Provider
      value={{
        activeSection,
        isEditable,
        editMode,
        setEditMode,
        openSection,
        closeDrawer,
      }}
    >
      {children}
    </EditContext.Provider>
  )
}

export function useEdit() {
  const context = useContext(EditContext)
  if (!context) {
    throw new Error("useEdit must be used within EditProvider")
  }
  return context
}

export function useEditOptional() {
  return useContext(EditContext)
}
