import { readFile } from "node:fs/promises"
import { join } from "node:path"

const traces = [
  ".next/server/app/api/[[...slugs]]/route.js.nft.json",
  ".next/server/app/.well-known/workflow/v1/step/route.js.nft.json",
]

const { default: sharp } = await import("sharp")
const runtimeSmoke = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).webp().toBuffer()
if (runtimeSmoke.length === 0) {
  throw new Error("Sharp runtime smoke produced an empty image")
}

for (const trace of traces) {
  const contents = JSON.parse(
    await readFile(join(import.meta.dir, "..", trace), "utf8"),
  ) as { files?: unknown }
  if (!Array.isArray(contents.files)) {
    throw new Error(`Sharp trace check could not read ${trace}`)
  }

  const files = contents.files.filter((file): file is string => typeof file === "string")
  const hasNativeAddon = files.some(
    (file) => /node_modules\/\@img\/sharp-[^/]+\/lib\/sharp-[^/]+\.node$/.test(file),
  )
  const hasLibvips = files.some(
    (file) => /node_modules\/\@img\/sharp-libvips-[^/]+\/lib\/libvips-cpp\./.test(file),
  )

  if (!hasNativeAddon || !hasLibvips) {
    const missing = [
      !hasNativeAddon ? "native addon" : null,
      !hasLibvips ? "libvips library" : null,
    ].filter(Boolean).join(" and ")
    throw new Error(
      `Sharp ${missing} missing from ${trace} on ${process.platform}/${process.arch}`,
    )
  }
}
