// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  uploadMasterServiceAgreementVersionAction: vi.fn(),
  revertMasterServiceAgreementVersionAction: vi.fn(),
}));

const { MasterServiceAgreementsPanel } = await import(
  "@/components/features/MasterServiceAgreementsPanel"
);

const versions = [
  {
    id: "msav_1",
    versionNumber: 1,
    status: "DISABLED" as const,
    fileName: "MSA_2024.pdf",
    uploadedByName: "Alex Morgan",
    uploadedAt: new Date("2024-01-01"),
    effectiveFrom: new Date("2024-01-01"),
    effectiveTo: new Date("2025-12-31"),
  },
  {
    id: "msav_2",
    versionNumber: 2,
    status: "ENABLED" as const,
    fileName: "MSA_2026.pdf",
    uploadedByName: "Alex Morgan",
    uploadedAt: new Date("2026-01-01"),
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
  },
];

describe("MasterServiceAgreementsPanel", () => {
  it("shows a 'no MSA' message when there are no versions", () => {
    render(<MasterServiceAgreementsPanel clientId="client_1" versions={[]} canManage={false} />);

    expect(screen.getByText("No MSA on file yet.")).toBeInTheDocument();
  });

  it("shows the current version prominently, with the effective date range", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" versions={versions} canManage={false} />
    );

    expect(screen.getByText("MSA_2026.pdf")).toBeInTheDocument();
    expect(screen.getByText(/1 Jan 2026/)).toBeInTheDocument();
  });

  it("hides the Upload control for a Delivery (non-managing) user", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" versions={versions} canManage={false} />
    );

    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
  });

  it("shows 'Upload new version' for a managing user once an MSA exists", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" versions={versions} canManage={true} />
    );

    expect(screen.getByRole("button", { name: "Upload new version" })).toBeInTheDocument();
  });

  it("shows 'Upload' (not 'Upload new version') when there is no MSA yet, for a managing user", () => {
    render(<MasterServiceAgreementsPanel clientId="client_1" versions={[]} canManage={true} />);

    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("reveals the upload form (file + effective dates) when the managing user clicks the button", async () => {
    const user = userEvent.setup();
    render(<MasterServiceAgreementsPanel clientId="client_1" versions={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(screen.getByLabelText("MSA file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective to (optional)")).toBeInTheDocument();
  });

  it("collapses the older version behind an expand toggle (not duplicating the current one), with a Revert action there", async () => {
    const user = userEvent.setup();
    render(
      <MasterServiceAgreementsPanel clientId="client_1" versions={versions} canManage={true} />
    );

    expect(screen.getByText(/MSA_2024\.pdf/)).not.toBeVisible();
    await user.click(screen.getByText("Version history (1)"));

    expect(screen.getByText(/MSA_2024\.pdf/)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Revert to this version" })).toHaveLength(1);
  });
});
