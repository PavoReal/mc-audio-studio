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
  laneBorder: string;
  rulerBg: string;
  rulerText: string;
  rulerTick: string;
}

/** Audacity dark-theme palette; mirrored as --aud-* vars in styles.css. */
export const WAVE_COLORS: WaveColors = {
  trackBg: "#212121",
  selectionBg: "#404040",
  peak: "#3f76b8",
  rms: "#85b5e2",
  peakSelected: "#5590cf",
  rmsSelected: "#a8cdef",
  zeroLine: "#838383",
  guide: "#3a3a3a",
  clip: "#ff2929",
  laneBorder: "#000000",
  rulerBg: "#2c2c2c",
  rulerText: "#b8b8b8",
  rulerTick: "#7a7a7a"
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
    ctx.setLineDash([2 * dpr, 3 * dpr]);
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
      for (let x = 0; x < width; x += 1) {
        const point = points[Math.min(bins - 1, Math.floor(x * bins / width))]!;
        const inSelection = x >= selectionStartX && x < selectionEndX;
        if (point.clipped) {
          ctx.fillStyle = colors.clip;
          ctx.fillRect(x, laneTop, 1, laneHeight);
          continue;
        }
        const top = center - point.max * amplitude;
        const bottom = center - point.min * amplitude;
        ctx.fillStyle = inSelection ? colors.peakSelected : colors.peak;
        ctx.fillRect(x, top, 1, Math.max(dpr, bottom - top));
        const rms = Math.min(point.rms, Math.max(point.max, -point.min));
        if (rms > 0) {
          ctx.fillStyle = inSelection ? colors.rmsSelected : colors.rms;
          ctx.fillRect(x, center - rms * amplitude, 1, Math.max(dpr, 2 * rms * amplitude));
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
  ctx.font = `${9 * dpr}px Inter, system-ui, sans-serif`;
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
