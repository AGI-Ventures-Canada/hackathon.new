const SERVER_LOCALE = "en-US"
const SERVER_TIME_ZONE = "UTC"

function localeForRender(isClient: boolean): string | undefined {
  return isClient ? undefined : SERVER_LOCALE
}

function timeZoneForRender(isClient: boolean): string | undefined {
  return isClient ? undefined : SERVER_TIME_ZONE
}

function formatPreviewDate(value: string, isClient: boolean): string {
  return new Date(value).toLocaleDateString(localeForRender(isClient), {
    month: "short",
    day: "numeric",
    timeZone: timeZoneForRender(isClient),
  })
}

export function formatPreviewScheduleTime(
  value: string,
  isClient: boolean,
): string {
  return new Date(value).toLocaleTimeString(localeForRender(isClient), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZoneForRender(isClient),
  })
}

export function getPendingInvitationTiming({
  createdAt,
  expiresAt,
  isClient,
  nowIso,
}: {
  createdAt: string
  expiresAt: string
  isClient: boolean
  nowIso: string | null
}): {
  expiryLabel: string
  isExpired: boolean
  sentLabel: string
} {
  const expiresAtMs = Date.parse(expiresAt)
  const nowMs = nowIso ? Date.parse(nowIso) : Number.NaN
  const hasCurrentTime = Number.isFinite(expiresAtMs) && Number.isFinite(nowMs)
  const isExpired = hasCurrentTime && expiresAtMs <= nowMs
  let expiryLabel = `Expires ${formatPreviewDate(expiresAt, isClient)}`

  if (hasCurrentTime) {
    const hoursLeft = Math.max(0, (expiresAtMs - nowMs) / (1000 * 60 * 60))
    expiryLabel = isExpired
      ? "Expired"
      : hoursLeft < 48
        ? `Expires in ${Math.ceil(hoursLeft)}h`
        : expiryLabel
  }

  return {
    expiryLabel,
    isExpired,
    sentLabel: `Sent ${formatPreviewDate(createdAt, isClient)}`,
  }
}
