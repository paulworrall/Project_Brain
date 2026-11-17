// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

// FB-012: three tiers, and one unmistakable disabled look for all of them.

function classesOf(name: string) {
  return screen.getByRole("button", { name }).className;
}

describe("Button tiers (FB-012)", () => {
  it("primary is a Navy fill with white text", () => {
    render(<Button>Do it</Button>);
    expect(classesOf("Do it")).toContain("bg-primary");
    expect(classesOf("Do it")).toContain("text-primary-foreground");
  });

  it("secondary is a Navy outline on white", () => {
    render(<Button variant="secondary">Do it</Button>);
    expect(classesOf("Do it")).toContain("bg-surface");
    expect(classesOf("Do it")).toContain("border-primary");
    expect(classesOf("Do it")).not.toContain("bg-primary ");
  });

  it("tertiary is a text link that underlines on hover", () => {
    render(<Button variant="tertiary">Do it</Button>);
    expect(classesOf("Do it")).toContain("hover:underline");
    expect(classesOf("Do it")).toContain("bg-transparent");
  });

  it.each(["primary", "secondary", "tertiary"] as const)(
    "%s: disabled and aria-disabled look the same and unlike the enabled button",
    (variant) => {
      const { rerender } = render(<Button variant={variant}>Do it</Button>);
      const enabled = classesOf("Do it");

      rerender(
        <Button variant={variant} disabled>
          Do it
        </Button>
      );
      const disabled = classesOf("Do it");
      expect(screen.getByRole("button")).toBeDisabled();

      rerender(
        <Button variant={variant} aria-disabled>
          Do it
        </Button>
      );
      const ariaDisabled = classesOf("Do it");
      expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");

      expect(disabled).toBe(ariaDisabled);
      expect(disabled).not.toBe(enabled);
      expect(disabled).toContain("cursor-not-allowed");
      expect(disabled).toContain("text-muted-foreground");
      // The old half-transparent Navy ("lavender") is gone.
      expect(disabled).not.toContain("opacity-50");
      expect(screen.getByRole("button")).toHaveAttribute("data-inactive", "true");
    }
  );

  it("exposes the reason through aria-describedby and shows a lock icon when locked", () => {
    const { container } = render(
      <>
        <Button variant="secondary" aria-disabled locked aria-describedby="why">
          Regenerate SOW
        </Button>
        <p id="why">Locked — the client approved v2.</p>
      </>
    );
    expect(screen.getByRole("button", { name: "Regenerate SOW" })).toHaveAccessibleDescription(
      "Locked — the client approved v2."
    );
    expect(container.querySelector("button svg")).not.toBeNull();
  });

  it("shows no lock icon unless asked", () => {
    const { container } = render(<Button disabled>Add to project</Button>);
    expect(container.querySelector("button svg")).toBeNull();
  });
});
