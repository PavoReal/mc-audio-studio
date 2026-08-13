import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawTimeRuler } from "../lib/waveformRender";
import { useDevicePixelRatio } from "./WaveformCanvas";

export function TimeRuler(props: { duration: number }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dpr = useDevicePixelRatio();

  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: box.width, height: box.height });
    });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const target = canvas.current;
    if (!target || !size.width || !size.height) return;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    target.width = width;
    target.height = height;
    const context = target.getContext("2d");
    if (context) drawTimeRuler(context, { width, height, dpr, duration: props.duration });
  }, [props.duration, size, dpr]);

  return <div ref={wrapper} className="time-ruler"><canvas ref={canvas} /></div>;
}

const AMP_LABELS = ["1.0", "0.5", "0", "-0.5", "-1.0"];

export function AmplitudeRuler(props: { laneCount: number }) {
  return (
    <div className="amp-ruler" aria-hidden="true">
      {Array.from({ length: props.laneCount }, (_, lane) => (
        <div key={lane} className="amp-lane">
          {AMP_LABELS.map((label, index) => (
            <span key={label} style={{ top: `${index * 25}%` }}>{label}</span>
          ))}
          {props.laneCount > 1 && <em>{lane === 0 ? "L" : "R"}</em>}
        </div>
      ))}
    </div>
  );
}
