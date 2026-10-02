// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SowSyncStatus } from "@/lib/sowSyncView";

const updateSowFromEstimateAction = vi.fn(async () => undefined);
vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  confirmSowEstimateSourceAction: vi.fn(),
  updateSowFromEstimateAction,
}));

const { SowSyncNotice } = await import("@/components/features/SowSyncNotice");
const { SowDownloadLink } = await import("@/components/features/SowDownloadLink");

const source = {
  estimateVersionId: "ev_1",
  estimateId: "est_1",
  estimateLabel: "Main",
  versionNumber: 1,
  total: 50400,
  currency: "USD",
  capabilities: ["TECH_AND_DATA" as const],
};
const current = {
  ...source,
  estimateVersionId: "ev_3",
  versionNumber: 3,
  total: 93000,
  capabilities: ["TECH_AND_DATA" as const, "TECH_SOLUTION_CONSULTING" as const, "AI_INNOVATION_AND_ENABLEMENT" as const],
};

const stale: SowSyncStatus = {
  sowVersionId: "sow_2",
  sowVersionNumber: 2,
  status: "stale",
  source,
  current,
  diff: {
    totalDelta: 42600,
    currencyChange: null,
    capabilitiesAdded: ["TECH_SOLUTION_CONSULTING", "AI_INNOVATION_AND_ENABLEMENT"],
    capabilitiesRemoved: [],
  },
};
const inSync: SowSyncStatus = { ...stale, status: "in_sync", current: source, diff: null };
const unlinked: SowSyncStatus = { ...stale, status: "unlinked", source: null, current: null, diff: null };

const options = [
  { estimateVersionId: "ev_1", label: "Main v1 — 50,400 USD" },
  { estimateVersionId: "ev_3", label: "Main v3 — 93,000 USD" },
];

describe("SowSyncNotice", () => {
  it("renders nothing while the SOW is in sync", () => {
    const { container } = render(<SowSyncNotice projectId="p1" sync={inSync} estimateVersionOptions={options} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a persistent 'Out of date' badge and the diff, in text, in a live region", () => {
    render(<SowSyncNotice projectId="p1" sync={stale} estimateVersionOptions={options} />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(within(region).getByText("Out of date")).toBeInTheDocument();
    expect(region).toHaveTextContent(
      "SOW v2 is based on Estimate v1 — 50,400 USD. Latest estimate is v3 — 93,000 USD (+42,600 USD). Capabilities added: TSC, AIAE."
    );
  });

  it("offers 'Update SOW to v3' as the primary action, making a new version from the current estimate", async () => {
    const user = userEvent.setup();
    render(<SowSyncNotice projectId="p1" sync={stale} estimateVersionOptions={options} />);

    const update = screen.getByRole("button", { name: "Update SOW to v3" });
    expect(screen.getByRole("status")).toHaveTextContent(/keeps the scope, assumptions and exclusions as they are/i);
    await user.click(update);
    expect(updateSowFromEstimateAction).toHaveBeenCalledWith("p1", "sow_2", undefined, expect.any(FormData));
  });

  it("asks the PM to confirm which estimate version an unlinked SOW reflects", () => {
    render(<SowSyncNotice projectId="p1" sync={unlinked} estimateVersionOptions={options} />);

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent(/which estimate version SOW v2 reflects/i);
    expect(within(region).queryByText("Out of date")).not.toBeInTheDocument();
    const select = within(region).getByRole("combobox", { name: /estimate version/i });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Main v1 — 50,400 USD",
      "Main v3 — 93,000 USD",
    ]);
    expect(within(region).getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /Update SOW/ })).not.toBeInTheDocument();
  });
});

describe("SowDownloadLink", () => {
  it("downloads directly when the SOW is current", () => {
    render(
      <SowDownloadLink href="/api/sow/1" staleWarning={null}>
        Download .docx →
      </SowDownloadLink>
    );
    expect(screen.getByRole("link", { name: "Download .docx →" })).toHaveAttribute("href", "/api/sow/1");
  });

  it("asks before downloading a stale SOW, traps focus in the dialog and restores it on close", async () => {
    const user = userEvent.setup();
    render(
      <SowDownloadLink href="/api/sow/1" staleWarning="This SOW reflects an older estimate (v1).">
        Download .docx →
      </SowDownloadLink>
    );

    const trigger = screen.getByRole("button", { name: "Download .docx →" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /out of date/i });
    expect(dialog).toHaveTextContent("This SOW reflects an older estimate (v1). Update it first, or download anyway?");
    expect(within(dialog).getByRole("link", { name: "Download anyway" })).toHaveAttribute("href", "/api/sow/1");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.click(within(dialog).getByRole("button", { name: "Update it first" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
