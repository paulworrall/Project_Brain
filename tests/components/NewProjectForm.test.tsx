// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getClientProjectDefaultsAction = vi.fn();
const createProjectAction = vi.fn();
const previewBriefFileAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/new/actions", () => ({
  createProjectAction,
  previewBriefFileAction,
  getClientProjectDefaultsAction,
}));

const { NewProjectForm } = await import("@/app/(dashboard)/projects/new/NewProjectForm");

const clientOptions = [
  { id: "client_coffee", name: "Coffee" },
  { id: "client_fizzy", name: "Fizzy" },
];

const msaOption = {
  id: "msa_1",
  fileName: "coffee-msa.pdf",
  effectiveFrom: new Date("2026-01-01"),
};

const rateCard = {
  id: "rc_1",
  name: "Coffee Rates",
  currency: "GBP",
  versions: [
    {
      id: "rcv_2",
      versionNumber: 2,
      fileName: "rates-v2.xlsx",
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
      status: "ENABLED",
      currencies: ["GBP"],
    },
    {
      id: "rcv_1",
      versionNumber: 1,
      fileName: "rates-v1.xlsx",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      status: "DISABLED",
      currencies: ["GBP"],
    },
  ],
};

/** One workstream, a current MSA and one rate card: everything defaults. */
const coffeeDefaults = {
  workstreams: [{ id: "ws_1", name: "Coffee Loyalty App" }],
  msa: msaOption,
  rateCards: [rateCard],
  defaultRateCard: { rateCardId: "rc_1", rateCardVersionId: "rcv_2" },
};

beforeEach(() => {
  getClientProjectDefaultsAction.mockReset();
  createProjectAction.mockReset();
  getClientProjectDefaultsAction.mockResolvedValue(coffeeDefaults);
});

// A dangling never-resolving promise left over at test end can bleed into
// later tests' `useActionState`/act scheduling (observed as spurious
// dialog-not-found or "component suspended" failures) — every test that
// simulates an in-flight submission resolves its deferred promise before
// finishing, even when the assertion of interest happens beforehand.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** FB-009 E: only Client and Brief are required. */
async function fillMinimalValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Client"), "client_coffee");
  await screen.findByText("Using:");
  await user.type(screen.getByLabelText("Brief"), "Some client brief text.");
}

describe("NewProjectForm — short form (FB-009 E)", () => {
  function submitted(): FormData {
    return createProjectAction.mock.calls[0][1] as FormData;
  }

  it("asks only for Client and Brief; name and PM are optional; no job number or dates", () => {
    render(<NewProjectForm clientOptions={clientOptions} />);
    expect(screen.getByLabelText("Client")).toBeRequired();
    expect(screen.getByLabelText("Project name (optional)")).not.toBeRequired();
    expect(
      screen.getByText("Leave blank and we'll suggest one from the brief.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Project manager (optional)")).not.toBeRequired();
    expect(screen.queryByLabelText(/Job/i)).toBeNull();
    expect(screen.queryByLabelText(/Kick-off|Target completion/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  it("defaults the PM to the current user", () => {
    render(
      <NewProjectForm
        clientOptions={clientOptions}
        pmOptions={[
          { id: "u_me", name: "Pat PM" },
          { id: "u_2", name: "Sam" },
        ]}
        defaultPmId="u_me"
      />
    );
    expect(screen.getByLabelText("Project manager (optional)")).toHaveValue("u_me");
    expect(screen.getByRole("option", { name: "Pat PM (you)" })).toBeInTheDocument();
  });

  it("uses the client's current MSA and rate card, shown as Using:, and submits them", async () => {
    createProjectAction.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await fillMinimalValidForm(user);

    expect(getClientProjectDefaultsAction).toHaveBeenCalledWith("client_coffee");
    expect(screen.getByText(/coffee-msa\.pdf, Coffee Rates \(GBP\) v2/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Rate card")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(createProjectAction).toHaveBeenCalled());
    expect(submitted().get("clientId")).toBe("client_coffee");
    expect(submitted().get("workstreamId")).toBe("ws_1");
    expect(submitted().get("masterServiceAgreementId")).toBe("msa_1");
    expect(submitted().get("rateCardId")).toBe("rc_1");
    expect(submitted().get("rateCardVersionId")).toBe("rcv_2");
    expect(submitted().get("name")).toBe("");
  });

  it("Change reveals the rate card selectors, and an override is submitted", async () => {
    createProjectAction.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await fillMinimalValidForm(user);

    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-expanded", "true");
    await user.selectOptions(screen.getByLabelText("Rate card version"), "rcv_1");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(createProjectAction).toHaveBeenCalled());
    expect(submitted().get("rateCardVersionId")).toBe("rcv_1");
  });

  it("explains a missing MSA and rate card, and still lets the project be created", async () => {
    getClientProjectDefaultsAction.mockResolvedValueOnce({
      workstreams: [{ id: "ws_2", name: "Fizzy Refresh" }],
      msa: null,
      rateCards: [],
      defaultRateCard: null,
    });
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await user.selectOptions(screen.getByLabelText("Client"), "client_fizzy");
    await screen.findByText("Using:");
    expect(screen.getByText(/no MSA, no rate card/)).toBeInTheDocument();
    expect(
      screen.getByText(/no Master Service Agreement on file. An Admin needs to add it/)
    ).toBeInTheDocument();
    expect(screen.getByText(/no rate card. An Admin needs to add one/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Brief"), "Brief.");
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });

  it("asks for a workstream only when the client has several", async () => {
    getClientProjectDefaultsAction.mockResolvedValueOnce({
      ...coffeeDefaults,
      workstreams: [
        { id: "ws_a", name: "Alpha" },
        { id: "ws_b", name: "Beta" },
      ],
    });
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await user.selectOptions(screen.getByLabelText("Client"), "client_coffee");
    await screen.findByText("Using:");
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Workstream"), "ws_b");
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });
});

describe("NewProjectForm — processing overlay", () => {
  it("opens the processing overlay the instant the paste-brief form is submitted", async () => {
    const deferred = createDeferred<{ message?: string } | undefined>();
    createProjectAction.mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await fillMinimalValidForm(user);

    await user.click(screen.getByRole("button", { name: "Create project" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Setting up your project")).toBeInTheDocument();

    deferred.resolve(undefined);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeInTheDocument());
  });

  async function submitUploadedBrief(user: ReturnType<typeof userEvent.setup>) {
    previewBriefFileAction.mockResolvedValue({
      ok: true,
      fileName: "brief.docx",
      charCount: 10,
      preview: "Brief",
    });
    await user.selectOptions(screen.getByLabelText("Client"), "client_coffee");
    await screen.findByText("Using:");
    await user.click(screen.getByLabelText("Upload file"));
    await user.upload(screen.getByLabelText("Brief"), new File(["x"], "brief.docx", { type: "" }));
    await screen.findByTestId("brief-file-preview");
    await user.click(screen.getByRole("button", { name: "Create project" }));
  }

  it("opens the processing overlay when submitting via file upload, same as pasted text", async () => {
    const deferred = createDeferred<{ message?: string } | undefined>();
    createProjectAction.mockReturnValueOnce(deferred.promise);
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);

    await submitUploadedBrief(user);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Setting up your project")).toBeInTheDocument();
    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    expect((createProjectAction.mock.calls[0][1] as FormData).get("briefFile")).toBeInstanceOf(
      File
    );

    deferred.resolve(undefined);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeInTheDocument());
  });

  it("shows a file error in the overlay and re-sends the same file on retry", async () => {
    createProjectAction.mockResolvedValueOnce({
      errors: { briefFile: ["We couldn't read any text from this file."] },
    });
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await submitUploadedBrief(user);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByText("We couldn't read any text from this file.")
      ).toBeInTheDocument()
    );

    const retryDeferred = createDeferred<{ message?: string } | undefined>();
    createProjectAction.mockReturnValueOnce(retryDeferred.promise);
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(2));
    const retryFile = (createProjectAction.mock.calls[1][1] as FormData).get("briefFile");
    expect(retryFile).toBeInstanceOf(File);
    expect((retryFile as File).name).toBe("brief.docx");

    retryDeferred.resolve(undefined);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeInTheDocument());
  });

  it("shows the failure reason with a retry action when the intake agent call fails, and resubmits on retry", async () => {
    createProjectAction.mockResolvedValueOnce({ message: "Claude couldn't classify this brief." });
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await fillMinimalValidForm(user);

    await user.click(screen.getByRole("button", { name: "Create project" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByText("Claude couldn't classify this brief.")).toBeInTheDocument()
    );

    const retryDeferred = createDeferred<{ message?: string } | undefined>();
    createProjectAction.mockReturnValueOnce(retryDeferred.promise);
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument());

    retryDeferred.resolve(undefined);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeInTheDocument());
  });

  it("dismisses the overlay and restores focus to the submit button when closed without retry", async () => {
    createProjectAction.mockResolvedValueOnce({ message: "Boom." });
    const user = userEvent.setup();
    render(<NewProjectForm clientOptions={clientOptions} />);
    await fillMinimalValidForm(user);

    const submitButton = screen.getByRole("button", { name: "Create project" });
    await user.click(submitButton);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("Boom.")).toBeInTheDocument());

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(submitButton);
  });

  describe("NewProjectForm — PM perspective", () => {
    it("offers an optional PM perspective section below the brief, with a helper prompt per field", () => {
      render(<NewProjectForm clientOptions={clientOptions} />);

      const section = screen.getByRole("group", { name: /PM perspective/ });
      expect(section).toHaveTextContent("(optional)");
      // Just two fields (Context, Consultancy guidance and Early KPIs were removed).
      expect(within(section).getAllByRole("textbox")).toHaveLength(2);
      expect(within(section).queryByLabelText("Context")).not.toBeInTheDocument();
      expect(within(section).queryByLabelText("Early KPIs")).not.toBeInTheDocument();
      // The title sits inside the box as a heading, not a legend on the border.
      expect(within(section).getByRole("heading", { name: /PM perspective/ })).toBeInTheDocument();
      for (const label of ["Initial thoughts", "Proposed solution"]) {
        const field = within(section).getByLabelText(label);
        expect(field).not.toBeRequired();
        expect(field).toHaveAccessibleDescription();
      }
      // Below the client brief, and not part of it.
      const brief = screen.getByLabelText("Brief");
      expect(
        brief.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(section).not.toContainElement(brief);
    });

    it("can be submitted with the PM perspective left empty", async () => {
      const user = userEvent.setup();
      createProjectAction.mockResolvedValue(undefined);
      render(<NewProjectForm clientOptions={clientOptions} />);

      await fillMinimalValidForm(user);
      await user.click(screen.getByRole("button", { name: "Create project" }));

      expect(createProjectAction).toHaveBeenCalledTimes(1);
      const formData = createProjectAction.mock.calls[0][1] as FormData;
      expect(formData.get("pm_initialThoughts")).toBe("");
      expect(formData.get("briefText")).toBe("Some client brief text.");
    });

    it("submits the PM's fields as their own inputs, separate from the brief text", async () => {
      const user = userEvent.setup();
      createProjectAction.mockResolvedValue(undefined);
      render(<NewProjectForm clientOptions={clientOptions} />);

      await fillMinimalValidForm(user);
      await user.type(screen.getByLabelText("Proposed solution"), "Start with one partner.");
      await user.click(screen.getByRole("button", { name: "Create project" }));

      const formData = createProjectAction.mock.calls[0][1] as FormData;
      expect(formData.get("pm_proposedSolution")).toBe("Start with one partner.");
      expect(formData.get("briefText")).toBe("Some client brief text.");
    });
  });
});

describe("NewProjectForm — Brief file upload (FB-002)", () => {
  beforeEach(() => previewBriefFileAction.mockReset());

  async function openUpload(user: ReturnType<typeof userEvent.setup>) {
    render(<NewProjectForm clientOptions={clientOptions} />);
    await user.click(screen.getByLabelText("Upload file"));
    return screen.getByLabelText("Brief") as HTMLInputElement;
  }

  it("shows the file name, character count and a Remove control after a successful read", async () => {
    previewBriefFileAction.mockResolvedValueOnce({
      ok: true,
      fileName: "brief.docx",
      charCount: 1234,
      preview: "Fizzy Coffee Campaign Brief",
    });
    const user = userEvent.setup();
    const input = await openUpload(user);

    await user.upload(input, new File(["x"], "brief.docx", { type: "" }));

    const preview = await screen.findByTestId("brief-file-preview");
    expect(preview).toHaveTextContent("brief.docx");
    expect(preview).toHaveTextContent("1,234 characters read");
    expect(preview).toHaveTextContent("Fizzy Coffee Campaign Brief");

    await user.click(within(preview).getByRole("button", { name: "Remove" }));
    expect(screen.queryByTestId("brief-file-preview")).not.toBeInTheDocument();
    expect(input.files).toHaveLength(0);
  });

  it("shows a specific inline message and clears the input when the server can't read the file", async () => {
    previewBriefFileAction.mockResolvedValueOnce({
      ok: false,
      error: "We couldn't read any text from this file.",
    });
    const user = userEvent.setup();
    const input = await openUpload(user);

    await user.upload(input, new File(["x"], "scan.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't read any text from this file."
    );
    expect(input.files).toHaveLength(0);
  });

  it("rejects legacy .doc client-side without calling the server", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const input = await openUpload(user);

    await user.upload(input, new File(["x"], "old.doc", { type: "application/msword" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/save as.*\.docx/i);
    expect(previewBriefFileAction).not.toHaveBeenCalled();
  });

  it("drops the chosen file when switching back to pasted text, so both can never be submitted", async () => {
    previewBriefFileAction.mockResolvedValueOnce({
      ok: true,
      fileName: "b.txt",
      charCount: 3,
      preview: "abc",
    });
    const user = userEvent.setup();
    const input = await openUpload(user);
    await user.upload(input, new File(["abc"], "b.txt", { type: "text/plain" }));
    await screen.findByTestId("brief-file-preview");

    await user.click(screen.getByLabelText("Paste text"));
    await user.click(screen.getByLabelText("Upload file"));

    expect(screen.queryByTestId("brief-file-preview")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Brief") as HTMLInputElement).files).toHaveLength(0);
  });
});
