"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const liquidButtonVariants = cva(
  "relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/30 px-7 py-3 text-sm font-medium text-white transition duration-300 hover:scale-[1.03] hover:border-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-11",
        xl: "h-12 px-8 text-base",
      },
    },
    defaultVariants: { size: "default" },
  },
)

export type LiquidButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof liquidButtonVariants> & {
    asChild?: boolean
  }

export function LiquidButton({
  className,
  size,
  asChild = false,
  children,
  ...props
}: LiquidButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp className={cn(liquidButtonVariants({ size, className }))} {...props}>
      <span className="absolute inset-0 bg-white/[0.09] backdrop-blur-md" />
      <span className="absolute inset-x-3 top-0 h-px bg-white/70" />
      <span className="relative z-10">{children}</span>
    </Comp>
  )
}
