// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  updateOtherServiceLabelAction: vi.fn(),
}));

const { DocumentVersionContent } = await import(
  "@/components/features/DocumentVersionContent"
);

describe("DocumentVersionContent", () => {
  it("renders nothing for the retired Clarification Email (FB-011)", () => {
    const { container } = render(
      <DocumentVersionContent
        projectId="proj_1"
        type="CLARIFICATION_EMAIL"
        content={{ subject: "Following up on your brief", bodyText: "Hi there," }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Position Document version, keeping an older version's AI-generated questions readable", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="POSITION_DOCUMENT"
        content={{
          primaryContactName: "Jamie Chen",
          primaryContactEmail: null,
          whatWeKnow: [],
          whatWeNeedToFindOut: ["Target audience"],
          clientFlaggedOpenItems: [],
        }}
      />
    );

    expect(screen.getByText("Other details from the brief")).toBeInTheDocument();
    expect(screen.getByText("Earlier open questions")).toBeInTheDocument();
    expect(screen.getByText("Target audience")).toBeInTheDocument();
  });

  it("renders nothing for the retired Set-Up Checklist (FB-011)", () => {
    const { container } = render(
      <DocumentVersionContent
        projectId="proj_1"
        type="CHECKLIST"
        content={{ items: ["Assign job code"] }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Deliverables + Services Document version without an editable Other label", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="DELIVERABLES_SERVICES_DOCUMENT"
        content={{
          deliverables: ["Creative concept territories"],
          services: {
            experienceCreative: { involvement: "Lead concept and design." },
            business: { involvement: "Not required." },
            architecture: { involvement: "Not required." },
            techAndData: { involvement: "Not required." },
            orchestration: { involvement: "Coordinate the schedule." },
            other: { involvement: "Legal review.", label: "Legal & Compliance" },
          },
          openQuestionsRisks: [],
          outstandingGapsCarriedForward: [],
        }}
      />
    );

    expect(screen.getByText("Legal & Compliance")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Legal & Compliance" })).not.toBeInTheDocument();
  });

  it("shows a friendly message when a version's content doesn't match its expected shape", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="POSITION_DOCUMENT"
        content={{ bogus: true }}
      />
    );

    expect(screen.getByText("This version's content couldn't be read.")).toBeInTheDocument();
  });
});
