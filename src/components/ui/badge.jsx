import React from "react";
import { cn } from "../../utils/cn";

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default:
      "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    secondary:
      "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive:
      "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border-2 border-border text-foreground bg-transparent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
