import { useEffect, useState } from "react";
import type { PreviewHandle } from "../lib/audio";

/** Tracks a PreviewHandle's playback position via requestAnimationFrame. */
export function usePlayhead(handle: PreviewHandle | null, playing: boolean, position: number): number {
  const [time, setTime] = useState(position);

  useEffect(() => {
    if (!handle || !playing) {
      setTime(position);
      return;
    }
    let raf = 0;
    const tick = () => {
      setTime(handle.getTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [handle, playing, position]);

  return time;
}
