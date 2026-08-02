"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { MapPin, Loader2 } from "lucide-react"

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

interface AddressAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onSelect?: (result: { displayName: string; latitude: number; longitude: number }) => void
  placeholder?: string
  autoFocus?: boolean
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder = "Search for an address...",
  autoFocus,
}: AddressAutocompleteProps) {
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (query.length < 3) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsSearching(true)
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "5",
        addressdetails: "0",
      })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": "hackathon.new" },
      })
      if (res.ok) {
        const data: NominatimResult[] = await res.json()
        setResults(data)
        setIsOpen(data.length > 0)
        setSelectedIndex(-1)
      }
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  function handleInputChange(newValue: string) {
    onChange(newValue)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(newValue), 350)
  }

  function handleSelect(result: NominatimResult) {
    onChange(result.display_name)
    onSelect?.({
      displayName: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    })
    setIsOpen(false)
    setResults([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault()
      e.stopPropagation()
      handleSelect(results[selectedIndex])
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {results.map((result, index) => (
            <li
              key={result.place_id}
              onMouseDown={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                "flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer",
                index === selectedIndex ? "bg-accent text-accent-foreground" : "text-popover-foreground"
              )}
            >
              <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{result.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
