"use client"

import { useState, useRef, useCallback } from "react"
import Cropper from "react-easy-crop"
import type { Area, Point } from "react-easy-crop"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ZoomIn, ImagePlus, Loader2 } from "lucide-react"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { cn } from "@/lib/utils"

type LogoVariant = "light" | "dark"

interface SponsorLogoUploadProps {
  logoUrl: string | null
  hackathonId: string
  sponsorId: string | null
  variant?: LogoVariant
  onFileSelected?: (file: File) => void
  onUploaded?: (url: string) => void
  disabled?: boolean
}

const ASPECT_RATIO = 2
const MAX_FILE_SIZE = 5 * 1024 * 1024

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image()
  image.src = imageSrc

  await new Promise((resolve) => {
    image.onload = resolve
  })

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")

  if (!ctx) {
    throw new Error("No 2d context")
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Canvas is empty"))
        }
      },
      "image/webp",
      0.95
    )
  })
}

export function SponsorLogoUpload({
  logoUrl,
  hackathonId,
  sponsorId,
  variant = "light",
  onFileSelected,
  onUploaded,
  disabled = false,
}: SponsorLogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"]

  function processFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a PNG, JPEG, or WebP image")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File must be smaller than 5MB")
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      setImageSrc(reader.result as string)
    })
    reader.readAsDataURL(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    processFile(file)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  async function handleCropComplete() {
    if (!imageSrc || !croppedAreaPixels) return

    setUploading(true)
    setError(null)

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const croppedFile = new File([croppedBlob], "logo.webp", { type: "image/webp" })
      if (croppedFile.size > MAX_FILE_SIZE) {
        throw new Error("The cropped logo must be smaller than 5MB")
      }

      if (sponsorId && !sponsorId.startsWith("temp-")) {
        const formData = new FormData()
        formData.append("file", croppedFile)
        formData.append("variant", variant)

        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/sponsors/${sponsorId}/logo`, {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to upload logo")
        }

        const data = await res.json()
        onUploaded?.(data.url)
      } else {
        const localUrl = URL.createObjectURL(croppedBlob)
        setPreviewUrl(localUrl)
        onFileSelected?.(croppedFile)
      }

      setImageSrc(null)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function handleCancel() {
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }

  const displayUrl = previewUrl || logoUrl

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          "h-14 w-28 p-2 flex items-center justify-center shrink-0 overflow-hidden transition-colors",
          displayUrl
            ? "hover:ring-2 hover:ring-primary/50"
            : "hover:opacity-80 border-dashed",
          variant === "dark"
            ? "bg-[#1a1a1a] border border-[#333]"
            : "bg-[#f5f5f4] border border-[#e5e5e5]"
        )}
      >
        {displayUrl ? (
          <OptimizedImage
            src={displayUrl}
            alt="Sponsor logo"
            width={96}
            height={40}
            className="max-h-10 max-w-full object-contain"
          />
        ) : (
          <div className={cn(
            "flex flex-col items-center justify-center",
            variant === "dark" ? "text-zinc-400" : "text-muted-foreground"
          )}>
            <ImagePlus className="size-5" />
          </div>
        )}
      </button>

      <Dialog open={!!imageSrc} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crop Logo</DialogTitle>
            <DialogDescription>
              Drag to reposition. Use the slider to zoom.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-48 bg-muted rounded-lg overflow-hidden">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT_RATIO}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                showGrid={false}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomIn className="size-4 text-muted-foreground shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(value) => setZoom(value[0])}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={uploading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCropComplete} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Apply"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
