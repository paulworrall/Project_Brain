// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const previewRateCardUploadAction = vi.fn();
const createRateCardAction = vi.fn();
const uploadRateCardVersionAction = vi.fn();

vi.mock("@/app/(dashboard)/clients/[clientId]/actions", () => ({
  previewRateCardUploadAction,
  createRateCardAction,
  uploadRateCardVersionAction,
}));

const { RateCardUploadFlow } = await import("@/components/features/RateCardUploadFlow");

const previewOk = {
  ok: true,
  fileName: "rates.xlsx",
  summary: "3 rates: 2 GBP, 1 EUR",
  currencies: ["GBP", "EUR"],
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  lines: [
    { sourceRow: 2, role: "Designer", grade: null, currency: "GBP", rate: "650", unit: "Day", effectiveFrom: "2026-01-01", effectiveTo: null, capability: "EXPERIENCE_DESIGN", notes: null },
    { sourceRow: 3, role: "Developer", grade: "Senior", currency: "EUR", rate: "62.125", unit: "Hour", effectiveFrom: "2026-01-01", effectiveTo: null, capability: null, notes: null },
  ],
};

const xlsx = () => new File(["x"], "rates.xlsx", { type: "" });

beforeEach(() => {
  previewRateCardUploadAction.mockReset();
  createRateCardAction.mockReset();
  uploadRateCardVersionAction.mockReset();
});

describe("RateCardUploadFlow", () => {
  it("offers the template download and only accepts .xlsx", () => {
    render(<RateCardUploadFlow clientId="c1" rateCardId="rc1" />);

    expect(screen.getByRole("link", { name: "Download template" })).toHaveAttribute("href", "/api/rate-card-template");
    expect(screen.getByLabelText("Rate card file (.xlsx)")).toHaveAttribute("accept", ".xlsx");
  });

  it("previews the parsed lines and currency summary, and saves nothing until confirmed", async () => {
    previewRateCardUploadAction.mockResolvedValueOnce(previewOk);
    const user = userEvent.setup();
    render(<RateCardUploadFlow clientId="c1" rateCardId="rc1" />);

    await user.upload(screen.getByLabelText("Rate card file (.xlsx)"), xlsx());
    await user.click(screen.getByRole("button", { name: "Check file" }));

    const preview = await screen.findByTestId("rate-card-preview");
    expect(preview).toHaveTextContent("3 rates: 2 GBP, 1 EUR");
    expect(preview).toHaveTextContent("Designer");
    expect(preview).toHaveTextContent("62.125");
    expect(preview).toHaveTextContent("Experience Design");
    expect(uploadRateCardVersionAction).not.toHaveBeenCalled();
    expect(createRateCardAction).not.toHaveBeenCalled();
  });

  it("creates the version with the same file only after the admin confirms", async () => {
    previewRateCardUploadAction.mockResolvedValueOnce(previewOk);
    uploadRateCardVersionAction.mockResolvedValueOnce(undefined);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<RateCardUploadFlow clientId="c1" rateCardId="rc1" onDone={onDone} />);

    await user.upload(screen.getByLabelText("Rate card file (.xlsx)"), xlsx());
    await user.click(screen.getByRole("button", { name: "Check file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(uploadRateCardVersionAction).toHaveBeenCalledTimes(1);
    const [clientId, rateCardId, , formData] = uploadRateCardVersionAction.mock.calls[0];
    expect([clientId, rateCardId]).toEqual(["c1", "rc1"]);
    expect((formData as FormData).get("file")).toBeInstanceOf(File);
  });

  it("lists every row error with its row number and offers no way to save", async () => {
    previewRateCardUploadAction.mockResolvedValueOnce({
      ok: false,
      errors: ["Row 12: 'EURO' isn't a valid currency code, use EUR.", "Row 14: Rate is required."],
    });
    const user = userEvent.setup();
    render(<RateCardUploadFlow clientId="c1" rateCardId="rc1" />);

    await user.upload(screen.getByLabelText("Rate card file (.xlsx)"), xlsx());
    await user.click(screen.getByRole("button", { name: "Check file" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 problems to fix");
    expect(alert).toHaveTextContent("Row 12: 'EURO' isn't a valid currency code, use EUR.");
    expect(alert).toHaveTextContent("Row 14: Rate is required.");
    expect(screen.queryByRole("button", { name: "Confirm and save" })).not.toBeInTheDocument();
  });

  it("blocks a .txt file in the browser with the template message, without calling the server", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<RateCardUploadFlow clientId="c1" rateCardId="rc1" />);

    await user.upload(screen.getByLabelText("Rate card file (.xlsx)"), new File(["x"], "RateCard_2026.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rate cards must be uploaded as Excel (.xlsx). Download the template to get started."
    );
    expect(previewRateCardUploadAction).not.toHaveBeenCalled();
  });

  it("asks for a name when creating a brand-new rate card, and passes it with the file", async () => {
    previewRateCardUploadAction.mockResolvedValueOnce(previewOk);
    createRateCardAction.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<RateCardUploadFlow clientId="c1" />);

    expect(screen.getByRole("button", { name: "Check file" })).toBeDisabled();
    await user.type(screen.getByLabelText("Name"), "2026 Rates");
    await user.upload(screen.getByLabelText("Rate card file (.xlsx)"), xlsx());
    await user.click(screen.getByRole("button", { name: "Check file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(createRateCardAction).toHaveBeenCalled());
    const formData = createRateCardAction.mock.calls[0][2] as FormData;
    expect(formData.get("name")).toBe("2026 Rates");
    expect(formData.get("file")).toBeInstanceOf(File);
  });
});
