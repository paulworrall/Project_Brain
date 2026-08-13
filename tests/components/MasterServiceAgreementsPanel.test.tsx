// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  createMasterServiceAgreementAction: vi.fn(),
}));

const { MasterServiceAgreementsPanel } = await import(
  "@/components/features/MasterServiceAgreementsPanel"
);

const agreements = [
  {
    id: "msa_1",
    fileName: "MSA_2024.pdf",
    effectiveFrom: new Date("2024-01-01"),
    effectiveTo: new Date("2025-12-31"),
    status: "SUPERSEDED" as const,
  },
  {
    id: "msa_2",
    fileName: "MSA_2026.pdf",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    status: "ACTIVE" as const,
  },
];

describe("MasterServiceAgreementsPanel", () => {
  it("shows a 'no MSAs' message when there are none", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" agreements={[]} canManage={false} />
    );

    expect(screen.getByText("No MSAs on file yet.")).toBeInTheDocument();
  });

  it("lists every MSA with its file name and status badge", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" agreements={agreements} canManage={false} />
    );

    expect(screen.getByText("MSA_2024.pdf")).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
    expect(screen.getByText("MSA_2026.pdf")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("hides the Replace/Add control for a Delivery (non-managing) user", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" agreements={agreements} canManage={false} />
    );

    expect(screen.queryByRole("button", { name: /Replace MSA|Add MSA/ })).not.toBeInTheDocument();
  });

  it("shows 'Replace MSA' (not 'Add MSA') when an Active MSA already exists, for a managing user", () => {
    render(
      <MasterServiceAgreementsPanel clientId="client_1" agreements={agreements} canManage={true} />
    );

    expect(screen.getByRole("button", { name: "Replace MSA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add MSA" })).not.toBeInTheDocument();
  });

  it("shows 'Add MSA' when there is no Active MSA yet, for a managing user", () => {
    render(<MasterServiceAgreementsPanel clientId="client_1" agreements={[]} canManage={true} />);

    expect(screen.getByRole("button", { name: "Add MSA" })).toBeInTheDocument();
  });

  it("reveals the upload form (file + effective dates) when the managing user clicks the button", async () => {
    const user = userEvent.setup();
    render(<MasterServiceAgreementsPanel clientId="client_1" agreements={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Add MSA" }));

    expect(screen.getByLabelText("MSA file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective to (optional)")).toBeInTheDocument();
  });
});
