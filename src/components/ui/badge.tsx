import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "badge",
  {
    variants: {
      variant: {
        default:
          "badge-info",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
        destructive:
          "badge-error",
        success:
          "badge-success",
        warning:
          "badge-warning",
        info:
          "badge-info",
        outline: "text-slate-950 border-slate-200",
        // E-commerce specific variants
        inStock:
          "badge-success",
        lowStock:
          "badge-warning",
        outOfStock:
          "badge-error",
        sale:
          "bg-red-500 text-white hover:bg-red-500/80",
        new:
          "bg-primary-500 text-white hover:bg-primary-500/80",
        featured:
          "bg-accent-500 text-white hover:bg-accent-500/80",
        premium:
          "bg-gradient-to-r from-warning-400 to-warning-500 text-white hover:opacity-90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }