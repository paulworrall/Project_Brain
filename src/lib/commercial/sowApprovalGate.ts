/**
 * Why a SOW version can't be approved yet, or null if it can. Same rule the
 * server enforces in approveVersion (ESTIMATE_NOT_APPROVED / SOW_SOURCE_MISMATCH),
 * shown inline so the disabled button explains itself.
 */
export function sowApprovalBlockedReason({
  approvedEstimateVersionId,
  approvedEstimateVersionNumber,
  sowSourceEstimateVersionId,
  sowSourceEstimateVersionNumber,
}: {
  approvedEstimateVersionId: string | null;
  approvedEstimateVersionNumber: number | null;
  sowSourceEstimateVersionId: string | null;
  sowSourceEstimateVersionNumber: number | null;
}): string | null {
  if (!approvedEstimateVersionId) return "Approve the estimate first.";
  if (sowSourceEstimateVersionId === approvedEstimateVersionId) return null;
  if (sowSourceEstimateVersionNumber === null) {
    return "This SOW is not linked to an estimate version. Regenerate the SOW first.";
  }
  return `This SOW was generated from Estimate v${sowSourceEstimateVersionNumber}, but v${approvedEstimateVersionNumber} is the approved estimate. Regenerate the SOW first.`;
}
