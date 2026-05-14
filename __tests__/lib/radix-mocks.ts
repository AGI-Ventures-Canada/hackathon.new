// Radix UI component mocks for tests that render empty on CI (Linux/happy-dom).
// Preloaded ONLY for the radix-isolated test group via --preload in run-unit-tests.ts.
// The Dialog mock here intentionally duplicates the one in component-mocks.tsx —
// they run in separate bun test processes and use different implementations
// (this one gates DialogContent visibility via context; component-mocks gates the entire Dialog).
import { mock } from "bun:test"
import {
  createElement,
  isValidElement,
  cloneElement,
  createContext,
  useContext,
  useState,
} from "react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = createElement as any

const DialogCtx = createContext({ open: true })

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => {
    const isOpen = open === undefined || open
    return h(DialogCtx.Provider, { value: { open: isOpen } },
      h("div", null, isOpen && h("button", { type: "button", onClick: () => onOpenChange?.(false) }, "Close Dialog"), children))
  },
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const ctx = useContext(DialogCtx)
    if (!ctx.open) return null
    return h("div", { role: "dialog", className }, children)
  },
  DialogHeader: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => h("h2", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) => h("p", null, children),
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<Record<string, unknown>>, { "aria-haspopup": "dialog", "aria-expanded": "false" })
    }
    return h("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": false }, children)
  },
  DialogClose: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    h("button", { type: "button", ...props }, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  DialogOverlay: () => h("div"),
  DialogPortal: ({ children }: { children: React.ReactNode }) => children,
}))

const AlertDialogCtx = createContext({ open: false })

mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => {
    const [internalOpen, setInternalOpen] = useState(open ?? false)
    const isOpen = open ?? internalOpen
    const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v) }
    return h(AlertDialogCtx.Provider, { value: { open: isOpen, setOpen } }, h("div", null, children))
  },
  AlertDialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    const ctx = useContext(AlertDialogCtx) as { open: boolean; setOpen: (v: boolean) => void }
    const triggerProps = { type: "button", "aria-haspopup": "dialog", "aria-expanded": String(ctx.open), onClick: () => ctx.setOpen(!ctx.open) }
    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<Record<string, unknown>>, triggerProps)
    }
    return h("button", triggerProps, children)
  },
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => {
    const ctx = useContext(AlertDialogCtx)
    if (!ctx.open) return null
    return h("div", { role: "alertdialog" }, children)
  },
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => h("h2", null, children),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => h("p", null, children),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  AlertDialogAction: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    h("button", { type: "button", ...props }, children),
  AlertDialogCancel: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    h("button", { type: "button", ...props }, children),
}))

const TabsCtx = createContext({ value: "", setValue: (_v: string) => {} })

mock.module("@/components/ui/tabs", () => ({
  Tabs: ({ children, className, defaultValue, value: controlledValue, onValueChange, ...props }: { children: React.ReactNode; className?: string; defaultValue?: string; value?: string; onValueChange?: (v: string) => void; [key: string]: unknown }) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? defaultValue ?? "")
    const value = controlledValue ?? internalValue
    const setValue = (v: string) => { setInternalValue(v); onValueChange?.(v) }
    return h(TabsCtx.Provider, { value: { value, setValue } }, h("div", { className, ...props }, children))
  },
  TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    h("div", { role: "tablist", className }, children),
  TabsTrigger: ({ children, value, ...props }: { children: React.ReactNode; value: string; [key: string]: unknown }) => {
    const ctx = useContext(TabsCtx)
    return h("button", { type: "button", role: "tab", "aria-selected": ctx.value === value ? "true" : "false", "data-value": value, onClick: () => ctx.setValue(value), ...props }, children)
  },
  TabsContent: ({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) => {
    const ctx = useContext(TabsCtx)
    if (ctx.value !== value) return null
    return h("div", { role: "tabpanel", "data-value": value, className }, children)
  },
  tabsListVariants: () => "",
}))

mock.module("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  TooltipTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    h("span", { "data-testid": "tooltip-trigger", ...props }, children),
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}))

mock.module("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  HoverCardTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    h("span", { "data-testid": "hovercard-trigger", ...props }, children),
  HoverCardContent: () => null,
}))

const DropdownCtx = createContext({ open: false, setOpen: (_v: boolean) => {} })

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = useState(false)
    return h(DropdownCtx.Provider, { value: { open, setOpen } }, h("div", null, children))
  },
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    const ctx = useContext(DropdownCtx)
    const triggerProps = { type: "button", onClick: () => ctx.setOpen(!ctx.open) }
    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<Record<string, unknown>>, triggerProps)
    }
    return h("button", triggerProps, children)
  },
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
    const ctx = useContext(DropdownCtx)
    if (!ctx.open) return null
    return h("div", { role: "menu" }, children)
  },
  DropdownMenuItem: ({ children, onClick, onSelect, asChild, className }: { children: React.ReactNode; onClick?: () => void; onSelect?: (e: { preventDefault: () => void }) => void; asChild?: boolean; className?: string }) => {
    const handle = () => {
      onClick?.()
      onSelect?.({ preventDefault: () => {} })
    }
    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<Record<string, unknown>>, { onClick: handle, className })
    }
    return h("button", { type: "button", role: "menuitem", onClick: handle, className }, children)
  },
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  DropdownMenuRadioItem: ({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect?: () => void }) =>
    h("button", { type: "button", role: "menuitemradio", "data-value": value, onClick: onSelect }, children),
  DropdownMenuSeparator: () => h("hr"),
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuCheckboxItem: ({ children, checked, onCheckedChange, onSelect, className }: { children: React.ReactNode; checked?: boolean; onCheckedChange?: (checked: boolean) => void; onSelect?: (e: { preventDefault: () => void }) => void; className?: string }) => {
    const handle = () => {
      onSelect?.({ preventDefault: () => {} })
      onCheckedChange?.(!checked)
    }
    return h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": checked, onClick: handle, className }, children)
  },
}))

mock.module("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => h("div", null, children),
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    if (asChild && isValidElement(children)) return children
    return h("button", { type: "button" }, children)
  },
  PopoverContent: () => null,
}))

mock.module("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, id, ...props }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; id?: string; [key: string]: unknown }) =>
    h("button", { type: "button", role: "switch", "aria-checked": checked ?? false, id, onClick: () => onCheckedChange?.(!checked), ...props }),
}))

const SelectCtx = createContext({ value: "", onValueChange: (_v: string) => {}, open: false, setOpen: (_v: boolean) => {} })

mock.module("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange?: (v: string) => void; value?: string }) => {
    const [open, setOpen] = useState(false)
    return h(SelectCtx.Provider, { value: { value: value ?? "", onValueChange: onValueChange ?? (() => {}), open, setOpen } }, children)
  },
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const ctx = useContext(SelectCtx)
    return h("button", { type: "button", role: "combobox", className, onClick: () => ctx.setOpen(!ctx.open) }, children)
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => {
    const ctx = useContext(SelectCtx)
    if (!ctx.open) return null
    return h("div", { role: "listbox" }, children)
  },
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
    const ctx = useContext(SelectCtx)
    return h("div", { role: "option", "data-value": value, onClick: () => { ctx.onValueChange(value); ctx.setOpen(false) } }, children)
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const ctx = useContext(SelectCtx)
    return h("span", null, ctx.value || placeholder)
  },
}))
