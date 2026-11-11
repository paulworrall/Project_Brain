export function FormError({ children }: { children?: string | string[] }) {
  if (!children || (Array.isArray(children) && children.length === 0)) {
    return null;
  }

  const messages = Array.isArray(children) ? children : [children];

  // Orange 900 text plus an icon, never colour alone. (Reporting Hub uses Orange 800,
  // which is 3.96:1 on Cream — below AA for this size.)
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger" role="alert">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      <span>{messages.join(" ")}</span>
    </p>
  );
}
