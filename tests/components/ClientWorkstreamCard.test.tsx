// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientWorkstreamCard } from "@/components/features/ClientWorkstreamCard";

describe("ClientWorkstreamCard", () => {
  it("links the Client name to its Client detail page", () => {
    render(
      <ClientWorkstreamCard
        client={{ id: "client_1", name: "Coffee", workstreams: [] }}
      />
    );

    expect(screen.getByRole("link", { name: "Coffee" })).toHaveAttribute(
      "href",
      "/clients/client_1"
    );
  });

  it("shows a 'no workstreams yet' message when the Client has none", () => {
    render(
      <ClientWorkstreamCard
        client={{ id: "client_1", name: "Tooth", workstreams: [] }}
      />
    );

    expect(screen.getByText("No workstreams yet")).toBeInTheDocument();
  });

  it("lists a single Workstream with its name, project count, and a link straight to it", () => {
    render(
      <ClientWorkstreamCard
        client={{
          id: "client_1",
          name: "Coffee",
          workstreams: [{ id: "ws_1", name: "Coffee Loyalty App", projectCount: 1 }],
        }}
      />
    );

    const link = screen.getByRole("link", { name: /Coffee Loyalty App/ });
    expect(link).toHaveAttribute("href", "/workstreams/ws_1");
    expect(link).toHaveTextContent("Coffee Loyalty App · 1 project");
  });

  it("handles zero projects and pluralizes correctly", () => {
    render(
      <ClientWorkstreamCard
        client={{
          id: "client_1",
          name: "Tooth",
          workstreams: [{ id: "ws_1", name: "Tooth Rebrand", projectCount: 0 }],
        }}
      />
    );

    expect(screen.getByText("Tooth Rebrand · 0 projects")).toBeInTheDocument();
  });

  it("renders every Workstream when a Client has several, each linking to its own page", () => {
    render(
      <ClientWorkstreamCard
        client={{
          id: "client_1",
          name: "Fizzy",
          workstreams: [
            { id: "ws_1", name: "Fizzy Summer Launch", projectCount: 1 },
            { id: "ws_2", name: "Fizzy Refresh 2026", projectCount: 2 },
            { id: "ws_3", name: "Fizzy Loyalty Pilot", projectCount: 0 },
          ],
        }}
      />
    );

    const summerLink = screen.getByRole("link", { name: /Fizzy Summer Launch/ });
    expect(summerLink).toHaveAttribute("href", "/workstreams/ws_1");
    expect(summerLink).toHaveTextContent("Fizzy Summer Launch · 1 project");

    const refreshLink = screen.getByRole("link", { name: /Fizzy Refresh 2026/ });
    expect(refreshLink).toHaveAttribute("href", "/workstreams/ws_2");
    expect(refreshLink).toHaveTextContent("Fizzy Refresh 2026 · 2 projects");

    const pilotLink = screen.getByRole("link", { name: /Fizzy Loyalty Pilot/ });
    expect(pilotLink).toHaveAttribute("href", "/workstreams/ws_3");
    expect(pilotLink).toHaveTextContent("Fizzy Loyalty Pilot · 0 projects");

    expect(screen.queryByText("No workstreams yet")).not.toBeInTheDocument();
  });

  it.each(["Coffee", "Fizzy", "Tooth"])("shows the %s client its own coloured icon, top right of the card", (name) => {
    const { container } = render(<ClientWorkstreamCard client={{ id: "c", name, workstreams: [] }} />);

    const icon = screen.getByTestId("client-icon");
    expect(icon).toHaveAttribute("data-client-icon", name.toLowerCase());
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.querySelector("svg")).not.toBeNull();
    // Same row as the name, after it (the row is justify-between, so it sits on the right).
    const header = icon.parentElement!;
    expect(header).toHaveClass("justify-between");
    expect(header.firstElementChild).toHaveTextContent(name);
    expect(container.querySelectorAll("[data-testid=client-icon]")).toHaveLength(1);
  });

  it("gives each demo client a different icon", () => {
    const markup = ["Coffee", "Fizzy", "Tooth"].map((name) => {
      const { unmount } = render(<ClientWorkstreamCard client={{ id: name, name, workstreams: [] }} />);
      const html = screen.getByTestId("client-icon").innerHTML;
      unmount();
      return html;
    });
    expect(new Set(markup).size).toBe(3);
  });

  it("shows no icon for any other client, rather than a misleading one", () => {
    render(<ClientWorkstreamCard client={{ id: "c", name: "Acme Corp", workstreams: [] }} />);
    expect(screen.queryByTestId("client-icon")).not.toBeInTheDocument();
  });
});
