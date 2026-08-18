import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "All Projects" },
  { href: "/sow-templates", label: "SOW Templates" },
];

export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="hidden w-56 shrink-0 border-r border-border bg-surface p-4 sm:block"
    >
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
