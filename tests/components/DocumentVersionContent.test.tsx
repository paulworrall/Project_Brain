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
  it("renders a Clarification Email version", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="CLARIFICATION_EMAIL"
        content={{ subject: "Following up on your brief", bodyText: "Hi there," }}
        kickOffDate={null}
        targetCompletionDate={null}
      />
    );

    expect(screen.getByText("Following up on your brief")).toBeInTheDocument();
  });

  it("renders a Position Document version", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="POSITION_DOCUMENT"
        content={{
          primaryContactName: "Jamie Chen",
          primaryContactEmail: null,
          whatWeKnow: [],
          whatWeNeedToFindOut: [],
          clientFlaggedOpenItems: [],
        }}
        kickOffDate={null}
        targetCompletionDate={null}
      />
    );

    expect(screen.getByText("Jamie Chen")).toBeInTheDocument();
  });

  it("renders a Set-Up Checklist version read-only", () => {
    render(
      <DocumentVersionContent
        projectId="proj_1"
        type="CHECKLIST"
        content={{ items: ["Assign job code"] }}
        kickOffDate={null}
        targetCompletionDate={null}
      />
    );

    expect(screen.getByText("Assign job code")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeDisabled();
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
        kickOffDate={null}
        targetCompletionDate={null}
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
        kickOffDate={null}
        targetCompletionDate={null}
      />
    );

    expect(screen.getByText("This version's content couldn't be read.")).toBeInTheDocument();
  });
});
