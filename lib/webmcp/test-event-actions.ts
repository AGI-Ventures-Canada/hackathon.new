export const OPEN_TEST_EVENT_CONVERSION_EVENT = "hackathon:open-test-event-conversion"

export function dispatchOpenTestEventConversion(): boolean {
  if (typeof window === "undefined") return false
  window.dispatchEvent(new CustomEvent(OPEN_TEST_EVENT_CONVERSION_EVENT))
  return true
}
