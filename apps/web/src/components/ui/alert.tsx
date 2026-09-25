import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-lg p-3 text-sm leading-relaxed", {
  variants: {
    variant: {
      default: "bg-muted text-foreground",
      destructive: "bg-red-50 text-red-700",
      warning: "bg-amber-50 text-amber-900",
      success: "bg-emerald-50 text-emerald-900",
    },
  },
  defaultVariants: { variant: "default" },
});

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"p"> & VariantProps<typeof alertVariants>) {
  const role = variant === "destructive" ? "alert" : variant === "success" ? "status" : undefined;
  return <p role={role} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { Alert };
