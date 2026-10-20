// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  askChatbotAction: vi.fn(),
  uploadKnowledgeItemAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
  updateChecklistItemDetailAction: vi.fn(),
}));

const { ChatPanel } = await import("@/components/features/ChatPanel");
const { KnowledgeUpload } = await import("@/components/features/KnowledgeUpload");
const { EditableChecklist } = await import("@/components/features/EditableChecklist");

// Guards the shared SidebarPanel extraction: these three panels must render exactly as before.
describe("sidebar panels markup", () => {
  it("Ask me anything", () => {
    const { container } = render(<ChatPanel projectId="p1" projectName="Fizzy Summer Launch" />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("Keep This Project Up to Date", () => {
    const { container } = render(<KnowledgeUpload projectId="p1" versions={[]} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("Project Set-Up Checklist", () => {
    const { container } = render(
      <EditableChecklist
        projectId="p1"
        items={[{ id: "i1", label: "Set up Workbook entry", isComplete: false, detailText: null }]}
      />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
