export const READY_HACKATHON_POSTGREST_FILTER =
  "metadata->aggregate_creation.is.null,metadata->aggregate_creation->>state.eq.complete"

export function isHackathonCreationReady(value: {
  metadata?: unknown
}): boolean {
  const metadata = value.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return true
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, "aggregate_creation")) {
    return true
  }

  const marker = Reflect.get(metadata, "aggregate_creation")
  return Boolean(
    marker &&
    typeof marker === "object" &&
    Reflect.get(marker, "state") === "complete",
  )
}
