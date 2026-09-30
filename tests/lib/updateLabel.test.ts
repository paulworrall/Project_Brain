import { describe, expect, it } from "vitest";
import { updateLabel, updateTitle, updateTypeLabel } from "@/lib/updateLabel";

const note = { title: null, type: "NOTE" as const, originalFileName: null };

describe("updateLabel", () => {
  it("labels an untitled update from its date, time (UK) and input type", () => {
    // 13:20 UTC is 14:20 in London during British Summer Time.
    const item = { ...note, uploadedAt: new Date("2026-09-30T13:20:00Z") };
    expect(updateLabel(item)).toBe("Update — 30 Sept 2026, 14:20 (Note)");
  });

  it("uses UK time outside summer time too, with a two-digit time", () => {
    const item = { ...note, uploadedAt: new Date("2026-12-01T09:05:00Z") };
    expect(updateLabel(item)).toBe("Update — 1 Dec 2026, 09:05 (Note)");
  });

  it("names the file for an uploaded document", () => {
    const item = {
      title: null,
      type: "DOCUMENT" as const,
      originalFileName: "call-notes.pdf",
      uploadedAt: new Date("2026-09-30T13:20:00Z"),
    };
    expect(updateTitle(item)).toBe("Update — 30 Sept 2026, 14:20");
    expect(updateTypeLabel(item)).toBe("call-notes.pdf");
    expect(updateLabel(item)).toBe("Update — 30 Sept 2026, 14:20 (call-notes.pdf)");
  });

  it("keeps the title an existing update was saved with", () => {
    const item = {
      title: "PM allocation",
      type: "NOTE" as const,
      originalFileName: null,
      uploadedAt: new Date("2026-09-24T08:00:00Z"),
    };
    expect(updateLabel(item)).toBe("PM allocation (Note)");
  });

  it("treats a blank title as no title", () => {
    const item = { ...note, title: "  ", uploadedAt: new Date("2026-09-30T13:20:00Z") };
    expect(updateTitle(item)).toBe("Update — 30 Sept 2026, 14:20");
  });
});
