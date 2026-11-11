import { InputHTMLAttributes, forwardRef } from "react";

// As Reporting Hub's `fieldBase`: square, strong border (5.4:1 on White), Navy text.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`min-h-10 w-full rounded-none border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
