import { useEffect, useState } from "react";
import type { CatalogVariant } from "../types";
import { waveform, type WaveformEnvelope } from "../lib/audio";
import { fetchVanillaBuffer } from "../lib/vanillaAudio";

interface VanillaWaveform {
  envelope: WaveformEnvelope;
  duration: number | null;
  loading: boolean;
  unavailable: boolean;
}

const EMPTY: VanillaWaveform = { envelope: [], duration: null, loading: false, unavailable: false };

/** Waveform for a vanilla Minecraft sound; pass null to disable (e.g. when a custom take is active). */
export function useVanillaWaveform(variant: CatalogVariant | null, bins: number): VanillaWaveform {
  const [state, setState] = useState<VanillaWaveform>(EMPTY);
  const hash = variant?.objectHash ?? null;

  useEffect(() => {
    if (!variant || !hash) {
      setState(EMPTY);
      return;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, unavailable: false }));
    void fetchVanillaBuffer(variant).then((buffer) => {
      if (!active) return;
      if (!buffer) {
        setState({ envelope: [], duration: null, loading: false, unavailable: true });
      } else {
        setState({ envelope: waveform(buffer, bins), duration: buffer.duration, loading: false, unavailable: false });
      }
    });
    return () => { active = false; };
  }, [hash, bins]);

  return state;
}
