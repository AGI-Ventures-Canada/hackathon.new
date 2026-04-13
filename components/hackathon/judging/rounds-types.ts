export type AdvancementRule = "manual" | "top_n" | "threshold"

export type AdvancementConfig = {
  topN?: number
  threshold?: number
}

export type RoundData = {
  id: string
  name: string
  status: string
  isActive: boolean
  displayOrder: number
  advancement: AdvancementRule
  advancementConfig: AdvancementConfig
  prizeCount: number
  screeningPrizeId: string | null
}
