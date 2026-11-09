import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Flat, compact controls use the ledger's jade primary, pale mint secondary,
 * 1px outline and text ghost variants.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-[14px] font-medium transition-[background-color,color,transform] hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-surface text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "border border-negative bg-surface text-negative hover:bg-[var(--pill-negative-bg)]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) return <Slot ref={ref} className={classes} {...props} />;

    // Browser autofill tools can add fdprocessedid before React hydrates.
    return <button ref={ref} className={classes} suppressHydrationWarning {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
