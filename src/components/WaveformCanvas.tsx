import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WaveformEnvelope } from "../lib/audio";
import { drawWaveform } from "../lib/waveformRender";

interface Props {
  envelope: WaveformEnvelope;
  duration: number;
  selection: { start: number; end: number } | null;
  onSelectionChange?: (start: number, end: number) => void;
  playheadTime: number | null;
  interactive: boolean;
  /** Reports the track width in device pixels so callers can size waveform bins. */
  onWidth?: (deviceWidth: number) => void;
}

const HANDLE_GRAB_PX = 6;
const MIN_SPAN = 0.01;

type DragMode = "start" | "end" | "new";

export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const media = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [dpr]);
  return dpr;
}

export function WaveformCanvas(props: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: DragMode; anchor: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dpr = useDevicePixelRatio();
  const { duration, onWidth } = props;

  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const deviceWidth = Math.round(size.width * dpr);
    if (!deviceWidth || !onWidth) return;
    const timer = window.setTimeout(() => onWidth(deviceWidth), 150);
    return () => window.clearTimeout(timer);
  }, [size.width, dpr, onWidth]);

  useLayoutEffect(() => {
    const target = canvas.current;
    if (!target || !size.width || !size.height) return;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    target.width = width;
    target.height = height;
    const context = target.getContext("2d");
    if (!context) return;
    drawWaveform(context, {
      envelope: props.envelope,
      width,
      height,
      dpr,
      duration: props.duration,
      selection: props.interactive ? props.selection : null
    });
  }, [props.envelope, props.selection, props.duration, props.interactive, size, dpr]);

  const timeAt = useCallback((clientX: number): number => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(duration, (clientX - rect.left) / rect.width * duration));
  }, [duration]);

  function emit(start: number, end: number) {
    props.onSelectionChange?.(Math.min(start, end), Math.max(start, end));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!props.interactive || !props.onSelectionChange || duration <= 0) return;
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return;
    const time = timeAt(event.clientX);
    let mode: DragMode = "new";
    if (props.selection) {
      const pxPerSecond = rect.width / duration;
      const nearStart = Math.abs(time - props.selection.start) * pxPerSecond <= HANDLE_GRAB_PX;
      const nearEnd = Math.abs(time - props.selection.end) * pxPerSecond <= HANDLE_GRAB_PX;
      if (nearStart && nearEnd) mode = time < (props.selection.start + props.selection.end) / 2 ? "start" : "end";
      else if (nearStart) mode = "start";
      else if (nearEnd) mode = "end";
    }
    drag.current = { mode, anchor: time, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || !props.selection) return;
    const time = timeAt(event.clientX);
    if (Math.abs(time - state.anchor) * (wrapper.current?.clientWidth ?? 0) / Math.max(duration, 1e-6) > 3) state.moved = true;
    if (!state.moved) return;
    if (state.mode === "new") emit(state.anchor, time);
    else if (state.mode === "start") emit(Math.min(time, props.selection.end - MIN_SPAN), props.selection.end);
    else emit(props.selection.start, Math.max(time, props.selection.start + MIN_SPAN));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!state) return;
    // A plain click (no drag) resets to the full range = no trim.
    if (!state.moved && state.mode === "new") emit(0, duration);
  }

  function onHandleKeyDown(edge: "start" | "end", event: React.KeyboardEvent<HTMLSpanElement>) {
    if (!props.selection || !props.onSelectionChange) return;
    const step = (event.shiftKey ? 0.1 : 0.01) * (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0);
    if (!step) return;
    event.preventDefault();
    const { start, end } = props.selection;
    if (edge === "start") emit(Math.max(0, Math.min(start + step, end - MIN_SPAN)), end);
    else emit(start, Math.min(duration, Math.max(end + step, start + MIN_SPAN)));
  }

  const toPercent = (seconds: number) => duration > 0 ? `${seconds / duration * 100}%` : "0%";

  return (
    <div
      ref={wrapper}
      className={`wave-track ${props.interactive ? "interactive" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas ref={canvas} className="wave-canvas" />
      {props.interactive && props.selection && (["start", "end"] as const).map((edge) => {
        const value = props.selection![edge];
        return <span
          key={edge}
          className="wave-trim-handle"
          role="slider"
          tabIndex={0}
          aria-label={edge === "start" ? "Trim start" : "Trim end"}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={value}
          style={{ left: toPercent(value) }}
          onKeyDown={(event) => onHandleKeyDown(edge, event)}
        />;
      })}
      {props.playheadTime !== null && duration > 0 && (
        <span className="wave-playhead" style={{ left: toPercent(props.playheadTime) }} />
      )}
    </div>
  );
}
