import { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // "feature" calls out a card as one of the platform's headline
  // capabilities (currently the chatbot and knowledge upload panels) —
  // a Navy top rule on the plain card, so it reads as more prominent
  // without a new component per caller.
  variant?: "default" | "feature";
}

// WPP ES | MAP cards are flat and square: White on Cream, no shadow, no gradient.
// Reporting Hub's cards have no border; Project Brain nests cards on White
// surfaces, so a 1px Rule border is kept — app-specific adaptation.
const VARIANT_CLASSES: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "border border-border bg-surface",
  feature: "border border-border border-t-4 border-t-navy bg-surface",
};

export function Card({ className = "", variant = "default", ...props }: CardProps) {
  return <div className={`rounded-none ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
