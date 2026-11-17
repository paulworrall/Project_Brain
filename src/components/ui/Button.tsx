import { ButtonHTMLAttributes, forwardRef } from "react";

// WPP ES | MAP buttons, as Reporting Hub's `ui/button.tsx`: square, Medium weight, Navy.
// FB-012 tiers:
//   primary   Navy fill, white text. On the project page only the Next step banner's
//             action uses it, plus the main submit inside an open dialog or form.
//   secondary Navy outline on White.
//   tertiary  Text-link style, underline on hover.
// `onNavy*` are for Navy emphasis panels.
// Disabled (true `disabled` or `aria-disabled`) is one look for every tier: grey fill and
// border, grey text, not-allowed cursor — clearly unlike any enabled variant. Pass `locked`
// to add a lock icon when the reason is a lock; show the reason next to the button
// (LockedNotice / the step's prerequisite note).
type ButtonVariant = "primary" | "secondary" | "tertiary" | "onNavy" | "onNavyOutline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground border border-primary hover:bg-primary-hover",
  secondary: "bg-surface text-primary border border-primary hover:bg-cream",
  tertiary:
    "bg-transparent text-primary border border-transparent underline-offset-4 hover:underline",
  onNavy: "bg-white text-navy border border-white hover:bg-cream",
  onNavyOutline: "bg-transparent text-white border border-white hover:bg-white/10",
};

const DISABLED_CLASSES =
  "cursor-not-allowed border border-border-strong bg-line-soft text-muted-foreground no-underline";
const DISABLED_TERTIARY_CLASSES =
  "cursor-not-allowed border border-transparent bg-transparent text-muted-foreground no-underline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** The button is inactive because something is locked: shows a lock icon. */
  locked?: boolean;
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", locked = false, className = "", children, ...props }, ref) => {
    const ariaDisabled = props["aria-disabled"];
    const inactive = Boolean(props.disabled) || ariaDisabled === true || ariaDisabled === "true";
    const look = inactive
      ? variant === "tertiary"
        ? DISABLED_TERTIARY_CLASSES
        : DISABLED_CLASSES
      : `cursor-pointer ${VARIANT_CLASSES[variant]}`;
    return (
      <button
        ref={ref}
        data-inactive={inactive ? "true" : undefined}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-none px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${look} ${className}`}
        {...props}
      >
        {locked && <LockIcon />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
