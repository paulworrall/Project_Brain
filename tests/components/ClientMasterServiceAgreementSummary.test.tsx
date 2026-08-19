// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientMasterServiceAgreementSummary } from "@/components/features/ClientMasterServiceAgreementSummary";

describe("ClientMasterServiceAgreementSummary", () => {
  it("shows the empty state when there's no current MSA", () => {
    render(<ClientMasterServiceAgreementSummary current={null} />);

    expect(screen.getByText("No MSA on file yet.")).toBeInTheDocument();
  });

  it("shows the current MSA as a library row with an 'active' tag and its filename", () => {
    render(<ClientMasterServiceAgreementSummary current={{ id: "msav_2", fileName: "MSA_2026.pdf" }} />);

    expect(screen.getByRole("heading", { name: "Master Service Agreement" })).toBeInTheDocument();
    expect(screen.getByText("(active)")).toBeInTheDocument();
    expect(screen.getByText("MSA_2026.pdf")).toBeInTheDocument();
    expect(screen.queryByText("No MSA on file yet.")).not.toBeInTheDocument();
  });

  it("links 'Manage in library' to the MSA library, not the SOW or Rate Card library", () => {
    render(<ClientMasterServiceAgreementSummary current={{ id: "msav_2", fileName: "MSA_2026.pdf" }} />);

    expect(screen.getByRole("link", { name: /Manage in library/ })).toHaveAttribute(
      "href",
      "/master-service-agreements"
    );
  });
});
