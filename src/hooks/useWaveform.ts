import { useEffect, useRef, useState } from "react";
import type { AudioTake } from "../types";
import { decodeAudio, waveform, type WaveformEnvelope } from "../lib/audio";
import { readBlob } from "../lib/opfs";

export function useWaveform(take: AudioTake | null, bins = 640) {
  const [envelope, setEnvelope] = useState<WaveformEnvelope>([]);
  const [loading, setLoading] = useState(false);
  const decoded = useRef<{ id: string; buffer: AudioBuffer } | null>(null);

  useEffect(() => {
    let active = true;
    if (!take) {
      setEnvelope([]);
      return;
    }
    if (decoded.current?.id === take.id) {
      setEnvelope(waveform(decoded.current.buffer, bins));
      return;
    }
    setLoading(true);
    void readBlob(take.opfsPath)
      .then(decodeAudio)
      .then((buffer) => {
        if (!active) return;
        decoded.current = { id: take.id, buffer };
        setEnvelope(waveform(buffer, bins));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [take?.id, bins]);

  return { envelope, loading };
}
