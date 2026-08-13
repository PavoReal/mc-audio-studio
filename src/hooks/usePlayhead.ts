import { useEffect, useState } from "react";
import type { PreviewHandle } from "../lib/audio";

/** Tracks a PreviewHandle's playback position via requestAnimationFrame. */
export function usePlayhead(handle: PreviewHandle | null): number | null {
  const [time, setTime] = useState<number | null>(null);

  useEffect(() => {
    if (!handle) {
      setTime(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const current = handle.getTime();
      setTime(current);
      if (current !== null) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setTime(null);
    };
  }, [handle]);

  return time;
}
