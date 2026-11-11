// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/Sidebar";

describe("Sidebar", () => {
  it("renders primary navigation: the pipeline home page and the client browser", () => {
    render(<Sidebar />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Browse clients" })).toHaveAttribute("href", "/browse");
  });
});
