// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addProjectInformationAction = vi.fn();
const sendAssistantMessageAction = vi.fn();
vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  addProjectInformationAction,
  sendAssistantMessageAction,
}));

const { AddProjectInformationPanel, formatFileSize } =
  await import("@/components/features/AddProjectInformationPanel");
const { ProjectSidebar } = await import("@/components/features/ProjectSidebar");

const versions = [
  {
    id: "brief",
    versionNumber: 1,
    label: "Initial brief",
    source: "CLIENT" as const,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    detail: null,
    summary: null,
    changeSummary: null,
  },
];

function ok(versionNumber: number, fileName: string | null = null) {
  return {
    ok: true,
    data: {
      projectId: "p1",
      versionNumber,
      fileName,
      confirmation: `Added as v${versionNumber} · Updated: budget`,
      notice: `Saved as v${versionNumber}. A fresh client email draft is being written from it — refresh in a moment to see it.`,
    },
  };
}

function sent(call: number) {
  const formData = addProjectInformationAction.mock.calls[call][1] as FormData;
  return Object.fromEntries(
    ["category", "source", "occurredOn", "content", "finalInBatch"].map((k) => [k, formData.get(k)])
  );
}

const docx = (name: string, size = 2048) =>
  new File([new Uint8Array(size)], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

beforeEach(() => addProjectInformationAction.mockReset());

describe("AddProjectInformationPanel", () => {
  it("sits above the Project assistant in the sidebar", () => {
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions} />);
    const panel = screen.getByRole("heading", { name: "Add project information" });
    const assistant = screen.getByRole("heading", { name: "Project assistant" });
    expect(
      panel.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Meeting notes, client clarifications, presentations — anything new about this project."
      )
    ).toBeInTheDocument();
  });

  it("has labelled Type, From and Date fields with sensible defaults", () => {
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    const type = screen.getByLabelText("Type");
    expect(
      within(type)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["Meeting notes", "Client clarification", "Presentation or document", "Other"]);
    expect(screen.getByRole("radio", { name: "Client" })).toBeChecked();
    // Defaults to today.
    expect(
      (screen.getByLabelText("Date it happened (optional)") as HTMLInputElement).value
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByRole("button", { name: "Add to project" })).toBeDisabled();
  });

  it("adds pasted text with its type, source and date, and announces the confirmation", async () => {
    addProjectInformationAction.mockResolvedValueOnce(ok(3));
    const user = userEvent.setup();
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.selectOptions(screen.getByLabelText("Type"), "CLIENT_CLARIFICATION");
    await user.click(screen.getByRole("radio", { name: "Internal team" }));
    await user.clear(screen.getByLabelText("Date it happened (optional)"));
    await user.type(screen.getByLabelText("Date it happened (optional)"), "2026-11-03");
    await user.type(screen.getByLabelText("Text to add"), "Budget is now £60k.");
    await user.click(screen.getByRole("button", { name: "Add to project" }));

    expect(sent(0)).toEqual({
      category: "CLIENT_CLARIFICATION",
      source: "INTERNAL_TEAM",
      occurredOn: "2026-11-03",
      content: "Budget is now £60k.",
      finalInBatch: "true",
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Added as v3 · Updated: budget");
    expect(status).toHaveTextContent(/fresh client email draft/);
    expect(screen.getByLabelText("Text to add")).toHaveValue("");
  });

  it("keeps the text and shows the error when saving fails", async () => {
    addProjectInformationAction.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION",
      message: "Something failed.",
    });
    const user = userEvent.setup();
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.type(screen.getByLabelText("Text to add"), "Notes");
    await user.click(screen.getByRole("button", { name: "Add to project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something failed.");
    expect(screen.getByLabelText("Text to add")).toHaveValue("Notes");
  });

  it("lists chosen files with name and size, removes one, and rejects an unsupported file", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.click(screen.getByRole("radio", { name: "Add files" }));
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Files to add"), [
      docx("notes.docx", 2048),
      docx("deck.docx", 3 * 1024 * 1024),
      new File(["x"], "old.doc", { type: "application/msword" }),
    ]);
    const list = screen.getByRole("list", { name: "Files to add" });
    expect(list).toHaveTextContent("notes.docx (2 KB)");
    expect(list).toHaveTextContent("deck.docx (3.0 MB)");
    expect(screen.getByRole("alert")).toHaveTextContent(/old\.doc: Older Word/);
    await user.click(screen.getByRole("button", { name: "Remove deck.docx" }));
    expect(list).not.toHaveTextContent("deck.docx");
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("saves each file as its own version in order, redrafting the email only after the last", async () => {
    addProjectInformationAction
      .mockResolvedValueOnce(ok(3, "a.docx"))
      .mockResolvedValueOnce(ok(4, "b.docx"));
    const user = userEvent.setup();
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.click(screen.getByRole("radio", { name: "Add files" }));
    await user.upload(screen.getByLabelText("Files to add"), [docx("a.docx"), docx("b.docx")]);
    await user.click(screen.getByRole("button", { name: "Add to project" }));

    const status = await screen.findByRole("status");
    expect(await within(status).findByText(/b\.docx: Added as v4/)).toBeInTheDocument();
    expect(status).toHaveTextContent("a.docx: Added as v3 · Updated: budget");
    const first = addProjectInformationAction.mock.calls[0][1] as FormData;
    const second = addProjectInformationAction.mock.calls[1][1] as FormData;
    expect((first.get("file") as File).name).toBe("a.docx");
    expect(first.get("finalInBatch")).toBe("false");
    expect((second.get("file") as File).name).toBe("b.docx");
    expect(second.get("finalInBatch")).toBe("true");
    expect(screen.queryByRole("list", { name: "Files to add" })).toBeNull();
  });

  it("stops at a failed file: earlier files stay saved, the failed one and later stay listed", async () => {
    addProjectInformationAction
      .mockResolvedValueOnce(ok(3, "a.docx"))
      .mockResolvedValueOnce({
        ok: false,
        code: "VALIDATION",
        message: "We couldn't read any text from this file.",
      });
    const user = userEvent.setup();
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.click(screen.getByRole("radio", { name: "Add files" }));
    await user.upload(screen.getByLabelText("Files to add"), [
      docx("a.docx"),
      docx("b.docx"),
      docx("c.docx"),
    ]);
    await user.click(screen.getByRole("button", { name: "Add to project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "b.docx: We couldn't read any text from this file."
    );
    expect(screen.getByRole("status")).toHaveTextContent("a.docx: Added as v3");
    const list = screen.getByRole("list", { name: "Files to add" });
    expect(list).not.toHaveTextContent("a.docx");
    expect(list).toHaveTextContent("b.docx");
    expect(list).toHaveTextContent("c.docx");
    expect(addProjectInformationAction).toHaveBeenCalledTimes(2);
  });

  it("is read-only once the project is complete", () => {
    render(<AddProjectInformationPanel projectId="p1" versions={versions} readOnly />);
    expect(
      screen.getByText(
        "This project is complete. Changes will need a change request (coming soon)."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to project" })).toBeDisabled();
  });

  it("shows the latest version and the history (moved from the assistant)", async () => {
    const user = userEvent.setup();
    render(<AddProjectInformationPanel projectId="p1" versions={versions} />);
    await user.click(screen.getByRole("button", { name: "View history (1)" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Initial brief");
  });
});
