"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

/** Counts from previous value to current with eased animation. */
export function AnimatedNumber({ value, duration = 700, format, className }: Props) {
  const [display, setDisplay] = useState(value);
  const startRef = useRef(value);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (display === value) return;
    startRef.current = display;
    startTime.current = null;

    let raf = 0;
    const tick = (t: number) => {
      if (startTime.current === null) startTime.current = t;
      const elapsed = t - startTime.current;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = startRef.current + (value - startRef.current) * eased;
      setDisplay(Math.round(current));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className={className}>{format ? format(display) : display.toLocaleString()}</span>;
}
