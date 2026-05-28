"use workflow"

export type ExportSubmissionsInput = {
  exportId: string
}

export async function exportSubmissionsWorkflow(
  input: ExportSubmissionsInput
): Promise<{ success: boolean; error?: string }> {
  const {
    loadExportData,
    buildAndUploadExport,
    finalizeExport,
    failExport,
  } = await import("./steps")

  try {
    const payload = await loadExportData(input.exportId)
    const result = await buildAndUploadExport(input.exportId, payload)
    await finalizeExport(input.exportId, result, payload)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failExport(input.exportId, message)
    return { success: false, error: message }
  }
}
