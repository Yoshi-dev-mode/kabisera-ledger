import * as React from "react";
import { cn } from "@/lib/utils";

/* Flat text input: 36px tall, 1px control border, 6px radius, jade focus ring (set globally). */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9 w-full rounded-control border border-input bg-surface px-3 text-[14px] text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
