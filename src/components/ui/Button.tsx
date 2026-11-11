import { ButtonHTMLAttributes, forwardRef } from "react";

// WPP ES | MAP buttons, as Reporting Hub's `ui/button.tsx`: square, Medium weight, Navy.
// `ghost` stays a borderless text button here (Reporting Hub's ghost is a dashed
// "add" button) — app-specific adaptation. `onNavy*` are for Navy emphasis panels.
type ButtonVariant = "primary" | "secondary" | "ghost" | "onNavy" | "onNavyOutline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground border border-primary hover:bg-primary-hover",
  secondary: "bg-surface text-foreground border border-primary hover:bg-cream",
  ghost: "text-foreground border border-transparent hover:bg-cream",
  onNavy: "bg-white text-navy border border-white hover:bg-cream",
  onNavyOutline: "bg-transparent text-white border border-white hover:bg-white/10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-none px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
