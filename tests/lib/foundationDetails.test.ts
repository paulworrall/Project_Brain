import { describe, expect, it } from "vitest";
import { deriveFoundationDetails } from "@/lib/foundationDetails";
import type { PositionDocumentFields } from "@/types/intake";

function positionDocument(overrides: Partial<PositionDocumentFields> = {}): PositionDocumentFields {
  return {
    primaryContactName: null,
    primaryContactEmail: null,
    whatWeKnow: [],
    whatWeNeedToFindOut: [],
    clientFlaggedOpenItems: [],
    ...overrides,
  };
}

describe("deriveFoundationDetails", () => {
  it("always returns exactly the five Foundation categories, in a fixed order", () => {
    const { categories } = deriveFoundationDetails(null, null, null);

    expect(categories.map((c) => c.key)).toEqual([
      "clientName",
      "problemObjective",
      "timeline",
      "budget",
      "scope",
    ]);
  });

  describe("Client Name", () => {
    it("is the client-side contact managing the project, not the client company", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument({ primaryContactName: "Jamie Chen", primaryContactEmail: "jamie@example.com" }),
        null,
        null
      );

      const clientName = categories.find((c) => c.key === "clientName")!;
      expect(clientName.state).toBe("confirmed");
      expect(clientName.value).toBe("Jamie Chen — jamie@example.com");
    });

    it("is Confirmed from just a name, with no email", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument({ primaryContactName: "Jamie Chen", primaryContactEmail: null }),
        null,
        null
      );

      const clientName = categories.find((c) => c.key === "clientName")!;
      expect(clientName.state).toBe("confirmed");
      expect(clientName.value).toBe("Jamie Chen");
    });

    it("is Partial when a contact is flagged as still to be confirmed, but no name is known yet", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument({ whatWeNeedToFindOut: ["Confirm the client-side project owner"] }),
        null,
        null
      );

      const clientName = categories.find((c) => c.key === "clientName")!;
      expect(clientName.state).toBe("partial");
    });

    it("is Missing with a placeholder when no name is known and nothing is flagged", () => {
      const { categories } = deriveFoundationDetails(positionDocument(), null, null);

      const clientName = categories.find((c) => c.key === "clientName")!;
      expect(clientName.state).toBe("missing");
      expect(clientName.value).toBeNull();
      expect(clientName.placeholder).toMatch(/not yet provided/i);
    });
  });

  it("marks every category Missing with a placeholder when nothing matches", () => {
    const { categories } = deriveFoundationDetails(positionDocument(), null, null);

    for (const category of categories) {
      expect(category.state).toBe("missing");
      expect(category.value).toBeNull();
      expect(category.placeholder).toMatch(/not yet provided/i);
    }
  });

  it("marks a category Confirmed when a whatWeKnow topic matches its keywords, using the paired detail as the value", () => {
    const { categories } = deriveFoundationDetails(
      positionDocument({ whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }] }),
      null,
      null
    );

    const problemObjective = categories.find((c) => c.key === "problemObjective")!;
    expect(problemObjective.state).toBe("confirmed");
    expect(problemObjective.value).toBe("Refresh the campaign.");
  });

  it("marks a category Partial when only flagged as a client open item, not stated as fact in the brief", () => {
    const { categories } = deriveFoundationDetails(
      positionDocument({ clientFlaggedOpenItems: ["Budget still TBC"] }),
      null,
      null
    );

    const budget = categories.find((c) => c.key === "budget")!;
    expect(budget.state).toBe("partial");
    expect(budget.value).toBe("Flagged as open: Budget still TBC");
  });

  it("marks a category Partial when only flagged as a genuine gap (whatWeNeedToFindOut)", () => {
    const { categories } = deriveFoundationDetails(
      positionDocument({ whatWeNeedToFindOut: ["Which channels are in scope"] }),
      null,
      null
    );

    const scope = categories.find((c) => c.key === "scope")!;
    expect(scope.state).toBe("partial");
  });

  it("prefers a whatWeKnow match over a flagged/gap match for the same category", () => {
    const { categories } = deriveFoundationDetails(
      positionDocument({
        whatWeKnow: [{ topic: "Scope", detail: "Paid social and CRM." }],
        whatWeNeedToFindOut: ["Full channel list"],
      }),
      null,
      null
    );

    const scope = categories.find((c) => c.key === "scope")!;
    expect(scope.state).toBe("confirmed");
    expect(scope.value).toBe("Paid social and CRM.");
  });

  describe("Timeline", () => {
    it("is Confirmed when both a start and target completion date are known", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument(),
        new Date("2026-09-01T00:00:00Z"),
        new Date("2026-12-01T00:00:00Z")
      );

      const timeline = categories.find((c) => c.key === "timeline")!;
      expect(timeline.state).toBe("confirmed");
      expect(timeline.value).toContain("Start: 1 Sept 2026");
      expect(timeline.value).toContain("Target completion: 1 Dec 2026");
    });

    it("is Partial when only a start date is known, with no deadline", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument(),
        new Date("2026-09-01T00:00:00Z"),
        null
      );

      const timeline = categories.find((c) => c.key === "timeline")!;
      expect(timeline.state).toBe("partial");
      expect(timeline.value).toMatch(/target completion not yet set/);
    });

    it("is Partial when only a target completion date is known, with no start date", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument(),
        null,
        new Date("2026-12-01T00:00:00Z")
      );

      const timeline = categories.find((c) => c.key === "timeline")!;
      expect(timeline.state).toBe("partial");
      expect(timeline.value).toMatch(/start date not yet set/);
    });

    it("is Confirmed from a brief-stated timeline detail even without Project dates set", () => {
      const { categories } = deriveFoundationDetails(
        positionDocument({ whatWeKnow: [{ topic: "Timeline", detail: "By end of Q3." }] }),
        null,
        null
      );

      const timeline = categories.find((c) => c.key === "timeline")!;
      expect(timeline.state).toBe("confirmed");
      expect(timeline.value).toBe("By end of Q3.");
    });

    it("is Missing when neither Project dates nor any brief mention nor a flagged item exist", () => {
      const { categories } = deriveFoundationDetails(positionDocument(), null, null);

      const timeline = categories.find((c) => c.key === "timeline")!;
      expect(timeline.state).toBe("missing");
    });
  });

  describe("secondary whatWeKnow", () => {
    it("returns whatWeKnow items that matched a Foundation category separately from the rest", () => {
      const { secondaryWhatWeKnow } = deriveFoundationDetails(
        positionDocument({
          whatWeKnow: [
            { topic: "Objective", detail: "Refresh the campaign." },
            { topic: "Attendees", detail: "Jamie, Sam, Priya" },
            { topic: "Meeting Type", detail: "Kickoff call" },
          ],
        }),
        null,
        null
      );

      expect(secondaryWhatWeKnow).toEqual([
        { topic: "Attendees", detail: "Jamie, Sam, Priya" },
        { topic: "Meeting Type", detail: "Kickoff call" },
      ]);
    });

    it("consumes each whatWeKnow item at most once, even if it could match multiple categories", () => {
      const { categories, secondaryWhatWeKnow } = deriveFoundationDetails(
        positionDocument({
          whatWeKnow: [{ topic: "Budget & Timeline", detail: "Fixed fee, delivery by Q4." }],
        }),
        null,
        null
      );

      const matchedCount = categories.filter((c) => c.state === "confirmed" && c.key !== "clientName").length;
      expect(matchedCount).toBe(1);
      expect(secondaryWhatWeKnow).toEqual([]);
    });

    it("returns an empty array when every whatWeKnow item maps to a Foundation category", () => {
      const { secondaryWhatWeKnow } = deriveFoundationDetails(
        positionDocument({ whatWeKnow: [{ topic: "Objective", detail: "Refresh the campaign." }] }),
        null,
        null
      );

      expect(secondaryWhatWeKnow).toEqual([]);
    });
  });
});
