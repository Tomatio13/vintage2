import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

const buttonVariants = cva(
  "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent px-3 text-ui-base font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "border-border bg-transparent text-foreground hover:bg-hover",
        ghost: "bg-transparent text-foreground-subtle hover:bg-hover hover:text-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/85",
      },
      size: {
        default: "h-8 px-3",
        compact: "h-7 px-2 text-ui-sm",
        icon: "size-8 px-0",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
