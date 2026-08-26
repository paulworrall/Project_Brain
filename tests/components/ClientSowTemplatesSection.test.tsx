// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createClientSpecificSOWTemplateAction = vi.fn(
  async (): Promise<{ message?: string } | undefined> => undefined
);

vi.mock("@/app/(dashboard)/sow-templates/actions", () => ({
  createClientSpecificSOWTemplateAction,
}));

const { ClientSowTemplatesSection } = await import(
  "@/components/features/ClientSowTemplatesSection"
);

const baseline = {
  id: "sow_baseline",
  name: "Standard SOW Template",
  isBaseline: true,
  currentVersionFileName: "standard-sow.docx",
};

const variants = [
  {
    id: "sow_variant",
    name: "Fizzy-specific SOW",
    isBaseline: false,
    currentVersionFileName: null,
  },
];

describe("ClientSowTemplatesSection", () => {
  it("shows the baseline (labeled) and this Client's own variants only", () => {
    render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={false}
      />
    );

    expect(screen.getByText("Standard SOW Template")).toBeInTheDocument();
    expect(screen.getByText("(baseline)")).toBeInTheDocument();
    expect(screen.getByText("standard-sow.docx")).toBeInTheDocument();
    expect(screen.getByText("Fizzy-specific SOW")).toBeInTheDocument();
    expect(screen.getByText("Not yet uploaded")).toBeInTheDocument();
  });

  it("links to the SOW Templates library for full management", () => {
    render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={false}
      />
    );

    expect(screen.getByRole("link", { name: /Manage in library/ })).toHaveAttribute(
      "href",
      "/sow-templates"
    );
  });

  it("hides the 'Add variant' control for a non-managing (Delivery) user", () => {
    render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={false}
      />
    );

    expect(screen.queryByRole("button", { name: /Add Fizzy-specific variant/ })).not.toBeInTheDocument();
  });

  it("shows a Client-named 'Add variant' action for a managing user, revealing a name+file form", async () => {
    const user = userEvent.setup();
    render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Fizzy-specific variant" }));

    expect(screen.getByLabelText("Variant name")).toBeInTheDocument();
    expect(screen.getByLabelText("SOW Template file")).toBeInTheDocument();
  });

  it("submits the new variant via createClientSpecificSOWTemplateAction", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Fizzy-specific variant" }));
    await user.type(screen.getByLabelText("Variant name"), "New Variant");
    await user.upload(
      screen.getByLabelText("SOW Template file"),
      new File(["contents"], "variant.txt", { type: "text/plain" })
    );
    // fireEvent.submit dispatches the submit event directly, same as
    // clicking the submit button, without jsdom's native file-input
    // constraint-validation gate (a jsdom limitation, not a real Browser
    // difference) short-circuiting it before React's action ever runs.
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(createClientSpecificSOWTemplateAction).toHaveBeenCalled());
  });

  it("keeps the create form open and shows the error, instead of silently closing, when the action fails", async () => {
    createClientSpecificSOWTemplateAction.mockImplementationOnce(async () => ({
      message: "Couldn't read that file.",
    }));
    const user = userEvent.setup();
    const { container } = render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Fizzy-specific variant" }));
    await user.type(screen.getByLabelText("Variant name"), "New Variant");
    await user.upload(
      screen.getByLabelText("SOW Template file"),
      new File(["contents"], "variant.docx", { type: "text/plain" })
    );
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByText("Couldn't read that file.")).toBeInTheDocument();
    });
    // The form must still be present — a failed upload must not look
    // identical to a successful one.
    expect(screen.getByLabelText("SOW Template file")).toBeInTheDocument();
  });

  it("closes the create form once the action actually succeeds", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClientSowTemplatesSection
        clientId="client_1"
        clientName="Fizzy"
        baseline={baseline}
        variants={variants}
        canManage={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Fizzy-specific variant" }));
    await user.type(screen.getByLabelText("Variant name"), "New Variant");
    await user.upload(
      screen.getByLabelText("SOW Template file"),
      new File(["contents"], "variant.docx", { type: "text/plain" })
    );
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.queryByLabelText("SOW Template file")).not.toBeInTheDocument();
    });
  });
});
