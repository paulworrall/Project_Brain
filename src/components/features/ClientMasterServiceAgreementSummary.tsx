import { LibrarySummaryList, type LibrarySummaryItem } from "./LibrarySummaryList";

export interface MasterServiceAgreementSummaryView {
  id: string;
  fileName: string;
}

/**
 * Read view of this Client's Master Service Agreement, matching the same
 * library-summary pattern as SOW Templates and Rate Cards — full
 * upload/revert management lives on the dedicated library page
 * (/master-service-agreements), not here. An MSA has no separate
 * "create a new named document" step the way Rate Cards/SOW variants do
 * (it's a single, unnamed document per Client, auto-created on first
 * upload), so there's no quick-add action on this page — only the link out.
 */
export function ClientMasterServiceAgreementSummary({
  current,
}: {
  current: MasterServiceAgreementSummaryView | null;
}) {
  const items: LibrarySummaryItem[] = current
    ? [{ id: current.id, name: "Master Service Agreement", tag: "active", fileName: current.fileName }]
    : [];

  return (
    <LibrarySummaryList
      title="Master Service Agreement"
      manageHref="/master-service-agreements"
      items={items}
      emptyMessage="No MSA on file yet."
    />
  );
}
