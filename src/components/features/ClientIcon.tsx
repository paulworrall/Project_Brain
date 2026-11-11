import type { ReactNode } from "react";

// Identifying icons, drawn in the MAP palette (Navy, the orange ramp, Tint tiles), for the anonymised demo clients (CLAUDE.md:
// Coffee / Fizzy / Tooth under the Caroline hub). Matched on the client's
// name; any other client simply gets no icon, so a real client added later
// never shows a misleading one. Decorative only — the client name is always
// shown as text next to it.

interface ClientIconDefinition {
  /** Soft tile behind the icon. */
  tileClass: string;
  svg: ReactNode;
}

const COFFEE: ClientIconDefinition = {
  tileClass: "bg-tint",
  svg: (
    <svg viewBox="0 0 32 32" className="h-8 w-8">
      <path
        d="M11 3.5c1.2 1.3 1.2 2.7 0 4M15 3c1.2 1.3 1.2 2.7 0 4M19 3.5c1.2 1.3 1.2 2.7 0 4"
        fill="none"
        stroke="#FF7800"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse cx="15" cy="26.5" rx="11" ry="2.3" fill="#F9BD5D" />
      <path
        d="M22.5 13.5h1.8a3.2 3.2 0 0 1 0 6.4h-2"
        fill="none"
        stroke="#000050"
        strokeWidth="2"
      />
      <path d="M6.5 11h16v7.5a6.5 6.5 0 0 1-6.5 6.5h-3a6.5 6.5 0 0 1-6.5-6.5z" fill="#000050" />
      <ellipse cx="14.5" cy="11" rx="8" ry="1.6" fill="#000050" />
      <path d="M9.5 15.5v4" stroke="#FF7800" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

const FIZZY: ClientIconDefinition = {
  tileClass: "bg-tint",
  svg: (
    <svg viewBox="0 0 32 32" className="h-8 w-8">
      <path d="M17 11 22.5 2.5" stroke="#D94E0E" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M7.5 7.5h17l-2.3 19.4a2.2 2.2 0 0 1-2.2 1.9h-8a2.2 2.2 0 0 1-2.2-1.9z"
        fill="#F9BD5D"
        stroke="#000050"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8.3 11.5h15.4l-1.9 15.3a1.6 1.6 0 0 1-1.6 1.4h-8.4a1.6 1.6 0 0 1-1.6-1.4z"
        fill="#FF7800"
      />
      <path d="M8.3 11.5h15.4" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="1.2" />
      <circle cx="12.5" cy="21.5" r="1.5" fill="#FFFFFF" />
      <circle cx="17.5" cy="16.5" r="1.1" fill="#FFFFFF" />
      <circle cx="15.5" cy="24.5" r="0.9" fill="#FFFFFF" />
      <circle cx="19.5" cy="22" r="1.3" fill="#FFFFFF" />
      <circle cx="12" cy="15.5" r="0.9" fill="#FFFFFF" />
      <circle cx="26" cy="7" r="1.1" fill="#FF7800" />
      <circle cx="5.5" cy="5.5" r="1" fill="#FF7800" />
    </svg>
  ),
};

const TOOTH: ClientIconDefinition = {
  tileClass: "bg-tint",
  svg: (
    <svg viewBox="0 0 32 32" className="h-8 w-8">
      <path
        d="M10 6c-3.2 0-5 2.6-5 5.8 0 2.7 1 4.6 1.9 6.6 1.1 2.6 1.4 8.1 3.7 8.1 2.2 0 2.1-5.3 5.4-5.3s3.2 5.3 5.4 5.3c2.3 0 2.6-5.5 3.7-8.1.9-2 1.9-3.9 1.9-6.6C27 8.6 25.2 6 22 6c-2.6 0-3.6 1.6-6 1.6S12.6 6 10 6z"
        fill="#FFFFFF"
        stroke="#000050"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M22.5 8.2c1.9.3 2.9 1.9 2.9 3.8 0 2-.7 3.5-1.5 5.2"
        fill="none"
        stroke="#F9BD5D"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 11c.3-1.1 1.1-1.8 2.2-2"
        fill="none"
        stroke="#F9BD5D"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M26 0.8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#FF7800" />
    </svg>
  ),
};

const ICONS_BY_CLIENT_NAME: Record<string, ClientIconDefinition> = {
  coffee: COFFEE,
  fizzy: FIZZY,
  tooth: TOOTH,
};

export function ClientIcon({ clientName }: { clientName: string }) {
  const icon = ICONS_BY_CLIENT_NAME[clientName.trim().toLowerCase()];
  if (!icon) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      data-testid="client-icon"
      data-client-icon={clientName.trim().toLowerCase()}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${icon.tileClass}`}
    >
      {icon.svg}
    </span>
  );
}
