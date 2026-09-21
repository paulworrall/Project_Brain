import { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // "feature" calls out a card as one of the platform's headline
  // capabilities (currently the chatbot and knowledge upload panels) —
  // a stronger border/background than the plain default, so it reads as
  // more prominent without a new component per caller.
  variant?: "default" | "feature";
}

const VARIANT_CLASSES: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "border border-border bg-surface shadow-sm",
  feature: "border-2 border-primary/30 bg-gradient-to-br from-accent to-surface shadow-md",
};

export function Card({ className = "", variant = "default", ...props }: CardProps) {
  return <div className={`rounded-lg ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
