// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VersionHistory, type VersionHistoryItem } from "@/components/features/VersionHistory";

const versions: VersionHistoryItem[] = [
  {
    id: "v1",
    versionNumber: 1,
    status: "DISABLED",
    fileName: "template-v1.docx",
    uploadedByName: "Alex Morgan",
    uploadedAt: new Date("2026-01-01"),
  },
  {
    id: "v2",
    versionNumber: 2,
    status: "ENABLED",
    fileName: "template-v2.docx",
    uploadedByName: "Alex Morgan",
    uploadedAt: new Date("2026-06-01"),
  },
];

function noop() {
  return Promise.resolve(undefined);
}

describe("VersionHistory (shared across MSA, Rate Card, and SOW Template)", () => {
  it("shows the current version prominently and an empty message when there are none", () => {
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={[]}
        canManage={false}
        onUpload={noop}
        makeRevertAction={() => noop}
        emptyMessage="No versions on file yet."
      />
    );

    expect(screen.getByText("No versions on file yet.")).toBeInTheDocument();
  });

  it("shows the current version's filename prominently with a 'Current' badge", () => {
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={false}
        onUpload={noop}
        makeRevertAction={() => noop}
      />
    );

    expect(screen.getByText("template-v2.docx")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("collapses older versions behind an expand toggle by default", () => {
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={noop}
        makeRevertAction={() => noop}
      />
    );

    expect(screen.getByText("Version history (1)")).toBeInTheDocument();
    expect(screen.getByText(/template-v1\.docx/)).not.toBeVisible();
  });

  it("reveals older versions, each with a Revert action, once expanded (managing user only)", async () => {
    const user = userEvent.setup();
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={noop}
        makeRevertAction={() => noop}
      />
    );

    await user.click(screen.getByText("Version history (1)"));

    expect(screen.getByText(/template-v1\.docx/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Set as current version" })).toBeInTheDocument();
  });

  it("hides the Revert action for a non-managing (Delivery) user, even when expanded", async () => {
    const user = userEvent.setup();
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={false}
        onUpload={noop}
        makeRevertAction={() => noop}
      />
    );

    await user.click(screen.getByText("Version history (1)"));

    expect(screen.queryByRole("button", { name: "Set as current version" })).not.toBeInTheDocument();
  });

  it("calls makeRevertAction with the specific version's id when Revert is clicked", async () => {
    const makeRevertAction = vi.fn(() => noop);
    const user = userEvent.setup();
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={noop}
        makeRevertAction={makeRevertAction}
      />
    );

    await user.click(screen.getByText("Version history (1)"));
    await user.click(screen.getByRole("button", { name: "Set as current version" }));

    expect(makeRevertAction).toHaveBeenCalledWith("v1");
  });

  it("hides the Upload control entirely for a non-managing user", () => {
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={false}
        onUpload={noop}
        makeRevertAction={() => noop}
      />
    );

    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
  });

  it("reveals a generic upload form (just the file input) with no children, for document types with no extra fields (e.g. SOW Template)", async () => {
    const user = userEvent.setup();
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={noop}
        makeRevertAction={() => noop}
        fileLabel="SOW Template file"
      />
    );

    await user.click(screen.getByRole("button", { name: "Upload new version" }));

    expect(screen.getByLabelText("SOW Template file")).toBeInTheDocument();
  });

  it("renders extra children fields inside the upload form, for document types that need them (e.g. MSA/Rate Card effective dates)", async () => {
    const user = userEvent.setup();
    render(
      <VersionHistory
        title="Master Service Agreement"
        versions={versions}
        canManage={true}
        onUpload={noop}
        makeRevertAction={() => noop}
        fileLabel="MSA file"
      >
        <label htmlFor="effectiveFromTest">Effective from</label>
        <input id="effectiveFromTest" name="effectiveFrom" type="date" />
      </VersionHistory>
    );

    await user.click(screen.getByRole("button", { name: "Upload new version" }));

    expect(screen.getByLabelText("MSA file")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });

  it("keeps the upload form open and shows the error, instead of silently closing, when the action fails", async () => {
    const user = userEvent.setup();
    const failingUpload = vi.fn(() =>
      Promise.resolve({ message: "Only the Client Engagement role can manage commercial documents." })
    );
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={failingUpload}
        makeRevertAction={() => noop}
        fileLabel="SOW Template file"
      />
    );

    await user.click(screen.getByRole("button", { name: "Upload new version" }));
    await user.upload(
      screen.getByLabelText("SOW Template file"),
      new File(["contents"], "new-version.docx", { type: "text/plain" })
    );
    // fireEvent.submit bypasses jsdom's native file-input constraint
    // validation gate (a jsdom limitation, not a real Browser difference)
    // that would otherwise short-circuit before React's action runs. Scoped
    // to the upload form specifically (via the file input) rather than
    // `container.querySelector("form")` — `versions` includes an older,
    // collapsed version whose own Revert <form> is still mounted earlier in
    // the DOM (<details> content stays mounted while closed), so a bare
    // first-form query would submit the wrong one.
    fireEvent.submit(screen.getByLabelText("SOW Template file").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText("Only the Client Engagement role can manage commercial documents.")
      ).toBeInTheDocument();
    });
    // The form (and its file input) must still be present — a failed
    // upload must not look identical to a successful one.
    expect(screen.getByLabelText("SOW Template file")).toBeInTheDocument();
  });

  it("closes the upload form once the action actually succeeds", async () => {
    const user = userEvent.setup();
    const successfulUpload = vi.fn(() => Promise.resolve(undefined));
    render(
      <VersionHistory
        title="Standard SOW Template"
        versions={versions}
        canManage={true}
        onUpload={successfulUpload}
        makeRevertAction={() => noop}
        fileLabel="SOW Template file"
      />
    );

    await user.click(screen.getByRole("button", { name: "Upload new version" }));
    await user.upload(
      screen.getByLabelText("SOW Template file"),
      new File(["contents"], "new-version.docx", { type: "text/plain" })
    );
    fireEvent.submit(screen.getByLabelText("SOW Template file").closest("form")!);

    await waitFor(() => {
      expect(screen.queryByLabelText("SOW Template file")).not.toBeInTheDocument();
    });
    expect(successfulUpload).toHaveBeenCalled();
  });
});
