import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/**
 * The shared look of a project-sidebar panel: a featured card with a circular
 * indigo icon badge, a bold title and a grey subtitle, then the panel's own
 * content. Pass the icon as an inline <svg> (24x24 viewBox, currentColor); it
 * is hidden from assistive tech, so the title carries the meaning.
 */
export function SidebarPanel({
  icon,
  title,
  subtitle,
  headingLevel = 3,
  className = "p-5",
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  headingLevel?: 2 | 3;
  /** Padding and layout for the card (e.g. "p-5", "flex h-full flex-col p-4"). */
  className?: string;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card variant="feature" className={className}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          {icon}
        </span>
        <div>
          <Heading className="text-base font-semibold text-foreground">{title}</Heading>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
