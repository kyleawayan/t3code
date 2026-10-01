import { cn } from "~/lib/utils";
import styles from "./TurnPulse.module.css";

/**
 * A thin sweeping bar while a recap is being written. It reuses the turn
 * gauge's transform-only sweep, so it never repaints, and it rests for
 * reduced motion.
 */
export function RecapActivityBar({ className }: { className?: string }) {
  return (
    <span
      role="progressbar"
      aria-label="Updating the recap"
      className={cn("pointer-events-none block h-[2px] overflow-hidden bg-success/15", className)}
    >
      <span className={cn("block h-full rounded-full bg-success/80", styles.thinkingBar)} />
    </span>
  );
}
