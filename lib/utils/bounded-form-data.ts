export class BoundedFormDataError extends Error {
  constructor(readonly code: "invalid_form" | "request_too_large") {
    super(code)
    this.name = "BoundedFormDataError"
  }
}

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentLengthHeader = request.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new BoundedFormDataError("invalid_form")
    }
    if (contentLength > maxBytes) {
      throw new BoundedFormDataError("request_too_large")
    }
  }

  const contentType = request.headers.get("content-type")
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new BoundedFormDataError("invalid_form")
  }

  const reader = request.body?.getReader()
  if (!reader) throw new BoundedFormDataError("invalid_form")

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new BoundedFormDataError("request_too_large")
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof BoundedFormDataError) throw error
    throw new BoundedFormDataError("invalid_form")
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }).formData()
  } catch {
    throw new BoundedFormDataError("invalid_form")
  }
}
