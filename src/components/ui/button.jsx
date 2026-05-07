import React from "react";
import { cn } from "../../utils/cn";

const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default:
        "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg active:scale-[0.98] transition-all duration-200",
      destructive:
        "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg active:scale-[0.98] transition-all duration-200",
      outline:
        "border-2 border-input bg-background hover:bg-accent hover:border-primary/30 hover:text-accent-foreground transition-all duration-200",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all duration-200",
      ghost: "hover:bg-accent hover:text-accent-foreground transition-colors duration-200",
      link: "text-primary underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-10 px-5 py-2 rounded-lg text-sm font-semibold",
      sm: "h-9 rounded-lg px-3.5 text-sm font-medium",
      lg: "h-11 rounded-lg px-6 text-base font-semibold",
      icon: "h-10 w-10 rounded-lg",
    };

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
