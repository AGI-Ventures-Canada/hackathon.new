import { describe, expect, it, mock } from "bun:test"
import { WebMcpActionRegistry } from "@/lib/webmcp/action-registry"

describe("WebMcpActionRegistry", () => {
  it("keeps stable accessors while updating visible context and actions", () => {
    const firstAction = mock((_value: string) => {})
    const secondAction = mock((_value: string) => {})
    const registry = new WebMcpActionRegistry<
      { revision: number },
      { navigate: string }
    >({ revision: 1 }, { navigate: firstAction })
    const getContext = registry.getContext

    registry.dispatch("navigate", "/first")
    registry.update({ revision: 2 }, { navigate: secondAction })
    registry.dispatch("navigate", "/second")

    expect(getContext()).toEqual({ revision: 2 })
    expect(firstAction).toHaveBeenCalledWith("/first")
    expect(secondAction).toHaveBeenCalledWith("/second")
  })
})
