"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { DevToolPanel } from "./dev-tool-panel"
import { useEventContext } from "./use-event-context"

const EDGE_MARGIN = 16
const SNAP_TRANSITION = "all 200ms cubic-bezier(0.25, 1, 0.5, 1)"
const DRAG_THRESHOLD = 8
const BUTTON_SIZE = 44
const SIDEBAR_WIDTH = 256

type EdgeY = "top" | "center" | "bottom"
type EdgeX = "left" | "center" | "right"
type Edge = `${EdgeY}-${EdgeX}`

function snapToEdge(x: number, y: number): { x: number; y: number; edge: Edge } {
  const hasSidebar = window.innerWidth >= 1024
  const leftEdge = hasSidebar ? SIDEBAR_WIDTH + EDGE_MARGIN : EDGE_MARGIN
  const rightEdge = window.innerWidth - BUTTON_SIZE - EDGE_MARGIN
  const contentMidX = hasSidebar ? (SIDEBAR_WIDTH + window.innerWidth) / 2 : window.innerWidth / 2
  const centerX = contentMidX - BUTTON_SIZE / 2
  const centerY = window.innerHeight / 2 - BUTTON_SIZE / 2

  const thirdX = (window.innerWidth - (hasSidebar ? SIDEBAR_WIDTH : 0)) / 3
  const offsetX = x - (hasSidebar ? SIDEBAR_WIDTH : 0)
  const edgeX: EdgeX = offsetX < thirdX ? "left" : offsetX < thirdX * 2 ? "center" : "right"

  const thirdY = window.innerHeight / 3
  const edgeY: EdgeY = y < thirdY ? "top" : y < thirdY * 2 ? "center" : "bottom"

  const snapX = edgeX === "left" ? leftEdge : edgeX === "center" ? centerX : rightEdge
  const snapY = edgeY === "top" ? EDGE_MARGIN : edgeY === "center" ? centerY : window.innerHeight - BUTTON_SIZE - EDGE_MARGIN

  return { x: snapX, y: snapY, edge: `${edgeY}-${edgeX}` }
}

function defaultPosition() {
  return {
    x: window.innerWidth - BUTTON_SIZE - EDGE_MARGIN,
    y: window.innerHeight - BUTTON_SIZE - EDGE_MARGIN,
  }
}

const SESSION_KEY = "devtools-state"

export function DevTool() {
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [edge, setEdge] = useState<Edge>("bottom-right")
  const [isSnapping, setIsSnapping] = useState(false)
  const [isActiveDrag, setIsActiveDrag] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const positionRef = useRef(position)
  const edgeRef = useRef(edge)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const hasMoved = useRef(false)
  const suppressClick = useRef(false)

  const eventContext = useEventContext()

  useEffect(() => { positionRef.current = position }, [position])
  useEffect(() => { edgeRef.current = edge }, [edge])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        sessionStorage.removeItem(SESSION_KEY)
        const s = JSON.parse(saved)
        setPosition(s.position ?? defaultPosition())
        setEdge(s.edge ?? "bottom-right")
        setExpanded(true)
      } else {
        setPosition(defaultPosition())
      }
      setMounted(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (isSnapping) {
      const timer = setTimeout(() => setIsSnapping(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isSnapping])

  useEffect(() => {
    function handleResize() {
      const snapped = snapToEdge(positionRef.current.x + BUTTON_SIZE / 2, positionRef.current.y + BUTTON_SIZE / 2)
      setPosition({ x: snapped.x, y: snapped.y })
      setEdge(snapped.edge)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const target = e.target as HTMLElement | null
        const inEditable =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable === true
        if (inEditable && !expanded) return
        e.preventDefault()
        setExpanded((v) => !v)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [expanded])

  const saveState = useCallback(() => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ position: positionRef.current, edge: edgeRef.current })
    )
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (expanded) return
      isDragging.current = true
      hasMoved.current = false
      dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      setIsSnapping(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expanded intentionally excluded to avoid re-binding during drag
    [position]
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (!hasMoved.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    if (!hasMoved.current) setIsActiveDrag(true)
    hasMoved.current = true
    const newX = Math.max(0, Math.min(dragStart.current.posX + dx, window.innerWidth - BUTTON_SIZE))
    const newY = Math.max(0, Math.min(dragStart.current.posY + dy, window.innerHeight - BUTTON_SIZE))
    setPosition({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    const wasDragging = hasMoved.current
    isDragging.current = false
    hasMoved.current = false
    setIsActiveDrag(false)
    suppressClick.current = wasDragging

    if (wasDragging) {
      const centerX = positionRef.current.x + BUTTON_SIZE / 2
      const centerY = positionRef.current.y + BUTTON_SIZE / 2
      const snapped = snapToEdge(centerX, centerY)
      setIsSnapping(true)
      setPosition({ x: snapped.x, y: snapped.y })
      setEdge(snapped.edge)
    }
  }, [])

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false
    hasMoved.current = false
    setIsActiveDrag(false)
    suppressClick.current = false
  }, [])

  const handleButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.preventDefault()
      return
    }
    setExpanded(true)
  }, [])

  if (!mounted) return null

  const [edgeY, edgeX] = edge.split("-") as [EdgeY, EdgeX]

  const panelOrigin = cn(
    edgeX === "right" ? "origin-right" : edgeX === "center" ? "origin-center" : "origin-left",
    edgeY === "bottom" ? "origin-bottom" : edgeY === "center" ? "origin-center" : "origin-top"
  )

  return (
    <div
      className={cn("fixed z-9999 select-none", !expanded && (isActiveDrag ? "cursor-grabbing" : "cursor-pointer"))}
      style={{
        left: position.x,
        top: position.y,
        transition: isSnapping ? SNAP_TRANSITION : "none",
      }}
    >
      {expanded ? (
        <>
        <div className="fixed inset-0" onClick={() => setExpanded(false)} />
        <div
          ref={panelRef}
          className={cn(
            "rounded-lg border border-dashed bg-card shadow-xl animate-in fade-in zoom-in-95 duration-150 w-[460px] max-h-[70vh] overflow-y-auto",
            panelOrigin
          )}
          style={{
            transform:
              [
                edgeX === "right"
                  ? `translateX(calc(-100% + ${BUTTON_SIZE}px))`
                  : edgeX === "center"
                    ? `translateX(calc(-50% + ${BUTTON_SIZE / 2}px))`
                    : "",
                edgeY === "bottom" || edgeY === "center"
                  ? `translateY(calc(-100% - ${EDGE_MARGIN}px))`
                  : `translateY(${BUTTON_SIZE + EDGE_MARGIN}px)`,
              ]
                .filter(Boolean)
                .join(" ") || undefined,
          }}
        >
          <DevToolPanel
            eventContext={eventContext}
            onClose={() => setExpanded(false)}
            onSaveState={saveState}
          />
        </div>
        </>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Open dev tools"
          aria-expanded={expanded}
          className="relative flex size-11 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-all duration-150 hover:text-foreground hover:shadow-lg"
          onClick={handleButtonClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <FlaskConical className="size-5 shrink-0" />
          {eventContext && (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary" />
          )}
        </button>
      )}
    </div>
  )
}
