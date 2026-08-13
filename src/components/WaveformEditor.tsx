import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, Copy, FileAudio, Mic2, Pause, Play, RotateCcw, Upload, Volume2, X } from "lucide-react";
import type { AudioTake, CatalogVariant, EditRecipe, SoundReplacement } from "../types";
import type { WaveformPoint } from "../lib/audio";
import { formatDuration, relativeSoundPath } from "../lib/format";
import { MicrophoneRecorder, previewEditedTake, previewRemote, stopPreview } from "../lib/audio";
import { vanillaSoundUrl } from "../lib/catalog";
import { useWaveform } from "../hooks/useWaveform";

interface Props {
  variant: CatalogVariant;
  replacement: SoundReplacement | null;
  busy: string;
  onImport: (file: File) => Promise<void>;
  onRecording: (blob: Blob) => Promise<void>;
  onRecipe: (recipe: EditRecipe) => void;
  onReset: () => void;
  onApplyEvent: () => void;
}

const WAVEFORM_WIDTH = 1200;
const LANE_HEIGHT = 100;

function envelopePath(points: WaveformPoint[], lane: number, core = false): string {
  if (!points.length) return "";
  const center = lane * LANE_HEIGHT + LANE_HEIGHT / 2;
  const amplitude = LANE_HEIGHT * 0.43;
  const x = (index: number) => points.length === 1 ? 0 : index / (points.length - 1) * WAVEFORM_WIDTH;
  const upper = points.map((point, index) => {
    const value = core ? Math.min(point.max, point.rms) : point.max;
    return `${x(index).toFixed(2)},${(center - value * amplitude).toFixed(2)}`;
  });
  const lower = points.map((point, index) => {
    const value = core ? Math.max(point.min, -point.rms) : point.min;
    return `${x(index).toFixed(2)},${(center - value * amplitude).toFixed(2)}`;
  }).reverse();
  return `M${upper.join(" L")} L${lower.join(" L")} Z`;
}

export function WaveformEditor(props: Props) {
  const activeTake = props.replacement?.takes.find((take) => take.id === props.replacement?.activeTakeId) ?? null;
  const recipe = props.replacement?.edit ?? { trimStart: 0, trimEnd: null, gainDb: 0 };
  const { envelope, loading } = useWaveform(activeTake);
  const [playing, setPlaying] = useState<"vanilla" | "custom" | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [recordPeak, setRecordPeak] = useState(0);
  const [recordError, setRecordError] = useState("");
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const recorder = useRef<MicrophoneRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const duration = activeTake?.duration ?? props.variant.duration ?? 1;
  const trimEnd = recipe.trimEnd ?? duration;
  const eventLabel = props.variant.events[0]?.replaceAll(".", " ") ?? "Unmapped sound";

  useEffect(() => () => stopPreview(), [props.variant.path]);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const refresh = async () => {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
      setMicrophones(devices);
      if (!microphoneId && devices[0]) setMicrophoneId(devices[0].deviceId);
    };
    void refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
  }, [microphoneId]);
  useEffect(() => () => recorder.current?.cancel(), []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      if (recorder.current) {
        setRecordTime((performance.now() - recorder.current.startedAt) / 1000);
        setRecordPeak(recorder.current.peak);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [recording]);

  const renderedEnvelope = useMemo(() => envelope.slice(0, 2).map((points, lane) => ({
    points,
    peakPath: envelopePath(points, lane),
    corePath: envelopePath(points, lane, true)
  })), [envelope]);
  const laneCount = Math.max(1, renderedEnvelope.length);

  async function toggleVanilla() {
    if (!props.variant.objectHash) return;
    if (playing === "vanilla") { stopPreview(); setPlaying(null); return; }
    setPlaying("vanilla");
    try { await previewRemote(vanillaSoundUrl(props.variant)); } finally { window.setTimeout(() => setPlaying(null), Math.max(1000, props.variant.duration * 1000)); }
  }

  async function toggleCustom() {
    if (!activeTake) return;
    if (playing === "custom") { stopPreview(); setPlaying(null); return; }
    setPlaying("custom");
    try { await previewEditedTake(activeTake, recipe); } finally { window.setTimeout(() => setPlaying(null), Math.max(1000, (trimEnd - recipe.trimStart) * 1000)); }
  }

  async function toggleRecording() {
    setRecordError("");
    try {
      if (recording && recorder.current) {
        const blob = await recorder.current.stop();
        recorder.current = null;
        setRecording(false);
        setRecordTime(0);
        await props.onRecording(blob);
        return;
      }
      stopPreview();
      const next = new MicrophoneRecorder();
      recorder.current = next;
      await next.start(microphoneId || undefined);
      setRecording(true);
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
      setMicrophones(devices);
    } catch (error) {
      recorder.current?.cancel();
      recorder.current = null;
      setRecording(false);
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setRecordError(denied
        ? "Microphone access was denied. Allow it in your browser settings, then try again."
        : error instanceof Error ? error.message : "The microphone could not be started.");
    }
  }

  function cancelRecording() {
    recorder.current?.cancel();
    recorder.current = null;
    setRecording(false);
    setRecordTime(0);
    setRecordPeak(0);
  }

  function setTrimStart(value: number) {
    props.onRecipe({ ...recipe, trimStart: Math.min(value, trimEnd - 0.01) });
  }
  function setTrimEnd(value: number) {
    props.onRecipe({ ...recipe, trimEnd: Math.max(value, recipe.trimStart + 0.01) });
  }

  return (
    <section className="editor-panel glass-panel">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">{eventLabel}</p>
          <h2>{relativeSoundPath(props.variant.path).replace(/\.ogg$/i, "")}</h2>
          <code>{props.variant.path}</code>
        </div>
        <div className="editor-badges">
          <span>{props.variant.channels === 2 ? "Stereo" : "Mono"}</span>
          <span>{(props.variant.sampleRate / 1000).toFixed(props.variant.sampleRate % 1000 ? 1 : 0)} kHz</span>
        </div>
      </div>

      <div className={`waveform-card ${recording ? "is-recording" : ""}`}>
        <div className="waveform-grid" aria-label={`${renderedEnvelope.length || 1}-channel amplitude waveform`}>
          <div className="waveform-scale" aria-hidden="true">
            {Array.from({ length: laneCount }, (_, lane) => <div key={lane}><span>+1.0</span><span>{laneCount > 1 ? `0 ${lane === 0 ? "L" : "R"}` : "0.0"}</span><span>−1.0</span></div>)}
          </div>
          <div className="waveform-canvas">
            <svg className="waveform-svg" viewBox={`0 0 ${WAVEFORM_WIDTH} ${laneCount * LANE_HEIGHT}`} preserveAspectRatio="none" role="img">
              <title>{activeTake ? `Waveform for ${activeTake.label}` : "No custom waveform loaded"}</title>
              <defs>
                <linearGradient id="waveform-peak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#94efff" /><stop offset="0.5" stopColor="#38bfff" /><stop offset="1" stopColor="#1679dc" />
                </linearGradient>
              </defs>
              {Array.from({ length: laneCount }, (_, lane) => {
                const center = lane * LANE_HEIGHT + LANE_HEIGHT / 2;
                return <g key={lane}>
                  <line className="waveform-guide" x1="0" x2={WAVEFORM_WIDTH} y1={center - LANE_HEIGHT * .215} y2={center - LANE_HEIGHT * .215} />
                  <line className="waveform-zero" x1="0" x2={WAVEFORM_WIDTH} y1={center} y2={center} />
                  <line className="waveform-guide" x1="0" x2={WAVEFORM_WIDTH} y1={center + LANE_HEIGHT * .215} y2={center + LANE_HEIGHT * .215} />
                </g>;
              })}
              {renderedEnvelope.map((channel, lane) => <g key={`audio-${lane}`}>
                <path className="waveform-peaks" d={channel.peakPath} />
                <path className="waveform-core" d={channel.corePath} />
                {channel.points.map((point, index) => point.clipped && <line
                  className="waveform-clipping"
                  key={index}
                  x1={index / Math.max(1, channel.points.length - 1) * WAVEFORM_WIDTH}
                  x2={index / Math.max(1, channel.points.length - 1) * WAVEFORM_WIDTH}
                  y1={lane * LANE_HEIGHT + 5}
                  y2={(lane + 1) * LANE_HEIGHT - 5}
                />)}
              </g>)}
            </svg>
            {activeTake && <>
              <span className="trim-shade trim-left" style={{ width: `${recipe.trimStart / duration * 100}%` }} />
              <span className="trim-shade trim-right" style={{ width: `${Math.max(0, (duration - trimEnd) / duration * 100)}%` }} />
              <span className="trim-handle" style={{ left: `${recipe.trimStart / duration * 100}%` }} />
              <span className="trim-handle" style={{ left: `${trimEnd / duration * 100}%` }} />
            </>}
          </div>
        </div>
        <div className="waveform-times"><span>{formatDuration(recipe.trimStart)}</span><span>{loading ? "Reading waveform…" : formatDuration(duration)}</span><span>{formatDuration(trimEnd)}</span></div>
        {recording && <div className="recording-overlay"><span className="record-pulse" /><strong>{formatDuration(recordTime)}</strong><div className="meter"><i style={{ width: `${recordPeak * 100}%` }} /></div><span>Recording PCM · 48 kHz mono</span></div>}
      </div>

      {activeTake ? (
        <div className="trim-controls">
          <label>In <input type="range" min={0} max={duration} step={0.01} value={recipe.trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></label>
          <label>Out <input type="range" min={0} max={duration} step={0.01} value={trimEnd} onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>
        </div>
      ) : (
        <div className="empty-waveform"><FileAudio size={18} /> Record or import a sound to unlock non-destructive trimming.</div>
      )}

      <div className="transport-row">
        <button className="transport" onClick={toggleVanilla} disabled={!props.variant.objectHash} title="Preview vanilla reference">
          {playing === "vanilla" ? <Pause size={17} /> : <Play size={17} />}<span>Vanilla</span>
        </button>
        <button className="transport primary" onClick={toggleCustom} disabled={!activeTake} title="Preview custom sound">
          {playing === "custom" ? <Pause size={17} /> : <Play size={17} />}<span>Custom</span>
        </button>
        <span className="transport-divider" />
        <button className={`record-button ${recording ? "active" : ""}`} onClick={() => void toggleRecording()} disabled={Boolean(props.busy)}>
          {recording ? <CircleStop size={19} /> : <Mic2 size={19} />}<span>{recording ? "Stop" : "Record"}</span>
        </button>
        {recording && <button className="transport" onClick={cancelRecording}><X size={17} /><span>Cancel</span></button>}
        <button className="transport" onClick={() => fileInput.current?.click()} disabled={Boolean(props.busy)}><Upload size={17} /><span>Import</span></button>
        <input ref={fileInput} className="sr-only" type="file" accept="audio/wav,audio/ogg,audio/mpeg,audio/flac,.wav,.ogg,.mp3,.flac" onChange={(event) => event.target.files?.[0] && void props.onImport(event.target.files[0])} />
      </div>
      {(microphones.length > 1 || recordError) && <div className="microphone-options">
        {microphones.length > 1 && <label>Microphone <select aria-label="Microphone device" value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}
        {recordError && <p role="alert">{recordError}</p>}
      </div>}

      <div className="edit-controls">
        <label className="gain-control"><span><Volume2 size={16} /> Gain</span><input type="range" min={-60} max={12} step={0.5} value={recipe.gainDb} disabled={!activeTake} onChange={(event) => props.onRecipe({ ...recipe, gainDb: Number(event.target.value) })} /><output>{recipe.gainDb > 0 ? "+" : ""}{recipe.gainDb.toFixed(1)} dB</output></label>
        <div className="editor-actions">
          <button className="button button-subtle" onClick={props.onReset} disabled={!activeTake}><RotateCcw size={15} /> Reset</button>
          <button className="button button-subtle" onClick={props.onApplyEvent} disabled={!activeTake || props.variant.events.length === 0}><Copy size={15} /> Apply to event</button>
        </div>
      </div>
    </section>
  );
}
