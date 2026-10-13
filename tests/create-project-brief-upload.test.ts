import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// FB-002: an uploaded brief must follow exactly the same path as pasted text.
// Prisma and the Intake Agent are mocked; the parser is real.

vi.setConfig({ testTimeout: 30000 }); // the first real PDF parse can be slow when the whole suite runs in parallel

const { runIntakeAgent } = vi.hoisted(() => ({ runIntakeAgent: vi.fn() }));
vi.mock("@/services/agents/intake-agent", () => ({
  IntakeAgentError: class IntakeAgentError extends Error {},
  runIntakeAgent,
  generateSetupChecklist: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "u1" } }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.spyOn(console, "error").mockImplementation(() => {});

// The Intake Agent mock rejects with this, ending the flow right after the
// call — the point of interest — before any database writes.
const STOP = new Error("STOP_AFTER_INTAKE");
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workstream: { findUnique: vi.fn().mockResolvedValue({ clientId: "c1" }) },
    masterServiceAgreement: { findFirst: vi.fn().mockResolvedValue({ id: "msa1" }) },
  },
}));

const { createProjectAction } = await import("@/app/(dashboard)/projects/new/actions");

function form(extra: (f: FormData) => void): FormData {
  const f = new FormData();
  f.set("workstreamId", "ws1");
  f.set("name", "Brief Upload Spec");
  f.set("masterServiceAgreementId", "msa1");
  extra(f);
  return f;
}

function fixtureBytes(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "brief", name)));
}

function fixtureFile(name: string, type: string): File {
  return new File([fixtureBytes(name)], name, { type });
}

beforeEach(() => {
  runIntakeAgent.mockReset();
  runIntakeAgent.mockRejectedValue(STOP);
});

describe("createProjectAction — Brief file upload (FB-002)", () => {
  it("accepts an upload with no briefText field — the original 'Invalid input' bug", async () => {
    // formData.get("briefText") is null here, as when the textarea is unmounted.
    await expect(
      createProjectAction(undefined, form((f) => f.set("briefFile", fixtureFile("brief.txt", "text/plain"))))
    ).rejects.toBe(STOP);
    expect(runIntakeAgent).toHaveBeenCalledTimes(1);
  });

  it("sends uploaded text to the Intake Agent exactly as pasted text of the same content", async () => {
    const text = Buffer.from(fixtureBytes("brief.txt")).toString("utf8").trim();

    await expect(createProjectAction(undefined, form((f) => f.set("briefText", text)))).rejects.toBe(STOP);
    await expect(
      createProjectAction(undefined, form((f) => f.set("briefFile", fixtureFile("brief.txt", "text/plain"))))
    ).rejects.toBe(STOP);

    expect(runIntakeAgent).toHaveBeenCalledTimes(2);
    expect(runIntakeAgent.mock.calls[1][0]).toBe(runIntakeAgent.mock.calls[0][0]);
  });

  it("feeds a .docx with an empty MIME type into the Intake Agent", async () => {
    await expect(
      createProjectAction(undefined, form((f) => f.set("briefFile", fixtureFile("brief-structured.docx", ""))))
    ).rejects.toBe(STOP);
    expect(runIntakeAgent.mock.calls[0][0]).toContain("GBP 150,000");
  });

  it("returns the specific file error inline and never calls the Intake Agent for an unreadable file", async () => {
    const result = await createProjectAction(
      undefined,
      form((f) => f.set("briefFile", fixtureFile("blank.pdf", "application/pdf")))
    );
    expect(result?.errors?.briefFile?.[0]).toMatch(/couldn't read any text/i);
    expect(runIntakeAgent).not.toHaveBeenCalled();
  });

  it("rejects legacy .doc with re-save guidance", async () => {
    const legacy = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "old.doc", { type: "application/msword" });
    const result = await createProjectAction(undefined, form((f) => f.set("briefFile", legacy)));
    expect(result?.errors?.briefFile?.[0]).toMatch(/save as.*\.docx/i);
  });

  it("rejects pasted text plus a file together", async () => {
    const result = await createProjectAction(
      undefined,
      form((f) => {
        f.set("briefText", "pasted");
        f.set("briefFile", fixtureFile("brief.txt", "text/plain"));
      })
    );
    expect(result?.message).toMatch(/either pasted text or a file/i);
    expect(runIntakeAgent).not.toHaveBeenCalled();
  });
});
