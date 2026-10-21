"use client";

import { motion } from "motion/react";
import { revealMotion, STILL_UNDER_REDUCED_MOTION } from "@/lib/reveal.ts";
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
    <motion.div className={cn(STILL_UNDER_REDUCED_MOTION, className)} {...revealMotion({ delay })}>
      {children}
    </motion.div>
  );
}
