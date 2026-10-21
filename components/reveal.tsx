"use client";

import { motion } from "motion/react";
import { revealMotion, SHOWN_WITHOUT_ANIMATION } from "@/lib/reveal.ts";
import { cn } from "@/lib/utils";

/**
 * Fades its children up as they enter the viewport. Pass `delay` to stagger
 * siblings. Still for anyone whose system asks for reduced motion.
 */
export function Reveal({
  children,
  delay,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div className={cn(SHOWN_WITHOUT_ANIMATION, className)} {...revealMotion({ delay })}>
      {children}
    </motion.div>
  );
}
