import { describe, expect, it, vi } from "vitest";

// KeyAttributeRow imports the project's server actions; only its pure tag helper is used here.
vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({}));

const { sourceTagText } = await import("@/components/features/KeyAttributeRow");
const { describeOrigin } = await import("@/lib/keyDetailsContext");

describe("where a key detail came from", () => {
  it("names the update's version, and says when it came from our own team", () => {
    expect(sourceTagText({ kind: "update", number: 2, internalTeam: false })).toBe("From update v2");
    expect(sourceTagText({ kind: "update", number: 3, internalTeam: true })).toBe(
      "From update v3 (Internal team)"
    );
    expect(sourceTagText({ kind: "update", number: null, internalTeam: false })).toBe("From an update");
  });

  it("says the same in prompts", () => {
    expect(describeOrigin({ kind: "update", number: 2, internalTeam: false })).toBe("from update v2");
    expect(describeOrigin({ kind: "update", number: 3, internalTeam: true })).toBe(
      "from update v3, from our internal team"
    );
  });
});
