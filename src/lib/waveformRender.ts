import type { WaveformEnvelope } from "./audio";

export interface WaveColors {
  trackBg: string;
  selectionBg: string;
  peak: string;
  rms: string;
  peakSelected: string;
  rmsSelected: string;
  zeroLine: string;
  guide: string;
  clip: string;
  /** Translucent shade painted over trimmed-away regions outside the selection. */
  trimmedShade: string;
  laneBorder: string;
  rulerBg: string;
  rulerText: string;
  rulerTick: string;
}

/** Minecraft night-sky palette; mirrored as --wave-* vars in styles.css. */
export const WAVE_COLORS: WaveColors = {
  trackBg: "#0b2b39",
  selectionBg: "#1b4c5f",
  peak: "#79a334",
  rms: "#bce254",
  peakSelected: "#95bd4c",
  rmsSelected: "#e0f0a8",
  zeroLine: "#8fabb3",
  guide: "#1c4356",
  clip: "#e2564f",
  trimmedShade: "rgba(4, 17, 24, 0.5)",
  laneBorder: "#05161e",
  rulerBg: "#0e3242",
  rulerText: "#b3cfd4",
  rulerTick: "#5d8392"
};

const TICK_STEPS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60];
const MIN_LABEL_SPACING_PX = 70;

export function niceTimeTicks(duration: number, widthPx: number): { major: number; minor: number } {
  const fallback = TICK_STEPS[TICK_STEPS.length - 1]!;
  if (duration <= 0 || widthPx <= 0) return { major: 1, minor: 0.2 };
  const major = TICK_STEPS.find((step) => duration / step * MIN_LABEL_SPACING_PX <= widthPx) ?? fallback;
  return { major, minor: major / 5 };
}

export function formatTick(seconds: number, step: number): string {
  if (seconds >= 60 && step >= 1) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds - minutes * 60);
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }
  const decimals = step >= 1 ? 0 : Math.min(3, Math.max(1, Math.ceil(-Math.log10(step))));
  return seconds.toFixed(decimals);
}

export interface DrawWaveformOptions {
  /** Per-channel waveform points; one point per canvas column ideally. */
  envelope: WaveformEnvelope;
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  duration: number;
  /** Selection in seconds, or null for no selection shading. */
  selection: { start: number; end: number } | null;
  colors?: WaveColors;
}

export function drawWaveform(ctx: CanvasRenderingContext2D, options: DrawWaveformOptions): void {
  const { envelope, width, height, dpr, duration } = options;
  const colors = options.colors ?? WAVE_COLORS;
  const laneCount = Math.max(1, envelope.length);
  const laneHeight = height / laneCount;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.trackBg;
  ctx.fillRect(0, 0, width, height);

  let selectionStartX = -1;
  let selectionEndX = -1;
  if (options.selection && duration > 0) {
    selectionStartX = Math.round(options.selection.start / duration * width);
    selectionEndX = Math.round(options.selection.end / duration * width);
    ctx.fillStyle = colors.selectionBg;
    ctx.fillRect(selectionStartX, 0, Math.max(0, selectionEndX - selectionStartX), height);
  }

  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneTop = lane * laneHeight;
    const center = laneTop + laneHeight / 2;
    const amplitude = laneHeight / 2 - dpr;

    // ±0.5 dotted guides
    ctx.strokeStyle = colors.guide;
    ctx.lineWidth = dpr;
    ctx.setLineDash([2 * dpr, 2 * dpr]);
    for (const sign of [-1, 1]) {
      const y = Math.round(center + sign * amplitude * 0.5) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const points = envelope[lane];
    if (points?.length) {
      const bins = points.length;
      // Chunky pixel columns snapped to a block grid, matching the Minecraft look.
      const block = Math.max(1, Math.round(2 * dpr));
      const snap = (value: number) => Math.round(value / block) * block;
      for (let x = 0; x < width; x += block) {
        const point = points[Math.min(bins - 1, Math.floor((x + block / 2) * bins / width))]!;
        const inSelection = x >= selectionStartX && x < selectionEndX;
        const columnWidth = Math.min(block, width - x);
        if (point.clipped) {
          ctx.fillStyle = colors.clip;
          ctx.fillRect(x, laneTop, columnWidth, laneHeight);
          continue;
        }
        const top = snap(center - point.max * amplitude);
        const bottom = snap(center - point.min * amplitude);
        ctx.fillStyle = inSelection ? colors.peakSelected : colors.peak;
        ctx.fillRect(x, top, columnWidth, Math.max(block, bottom - top));
        const rms = Math.min(point.rms, Math.max(point.max, -point.min));
        if (rms > 0) {
          const rmsTop = snap(center - rms * amplitude);
          const rmsBottom = snap(center + rms * amplitude);
          ctx.fillStyle = inSelection ? colors.rmsSelected : colors.rms;
          ctx.fillRect(x, rmsTop, columnWidth, Math.max(block, rmsBottom - rmsTop));
        }
      }
    }

    // zero line on top of the waveform, like Audacity
    ctx.fillStyle = colors.zeroLine;
    ctx.fillRect(0, Math.round(center), width, dpr);

    if (lane > 0) {
      ctx.fillStyle = colors.laneBorder;
      ctx.fillRect(0, Math.round(laneTop), width, dpr);
    }
  }

  if (options.selection && duration > 0) {
    ctx.fillStyle = colors.trimmedShade;
    if (selectionStartX > 0) ctx.fillRect(0, 0, selectionStartX, height);
    if (selectionEndX < width) ctx.fillRect(selectionEndX, 0, width - selectionEndX, height);
  }
}

export interface DrawTimeRulerOptions {
  width: number;
  height: number;
  dpr: number;
  duration: number;
  colors?: WaveColors;
}

export function drawTimeRuler(ctx: CanvasRenderingContext2D, options: DrawTimeRulerOptions): void {
  const { width, height, dpr, duration } = options;
  const colors = options.colors ?? WAVE_COLORS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.rulerBg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.rulerTick;
  ctx.fillRect(0, height - dpr, width, dpr);
  if (duration <= 0) return;

  const { major, minor } = niceTimeTicks(duration, width / dpr);
  ctx.font = `${8 * dpr}px Monocraft, "Courier New", monospace`;
  ctx.textBaseline = "top";

  for (let t = 0, index = 0; t <= duration + minor / 2; index += 1, t = index * minor) {
    const x = Math.round(t / duration * width);
    if (x > width) break;
    const isMajor = Math.round(t / minor) % 5 === 0;
    const tickHeight = (isMajor ? 8 : 4) * dpr;
    ctx.fillStyle = colors.rulerTick;
    ctx.fillRect(Math.min(x, width - dpr), height - tickHeight, dpr, tickHeight);
    if (isMajor && x < width - 8 * dpr) {
      ctx.fillStyle = colors.rulerText;
      ctx.fillText(formatTick(t, major), x + 3 * dpr, 2 * dpr);
    }
  }
}
