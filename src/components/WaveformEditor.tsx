import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Copy, FileAudio, Mic2, Pause, Play, RotateCcw, Upload, Volume2, X } from "lucide-react";
import type { AudioTake, CatalogVariant, EditRecipe, SoundReplacement } from "../types";
import { formatDuration, relativeSoundPath } from "../lib/format";
import { MicrophoneRecorder, previewEditedTake, previewRemote, stopPreview, type PreviewHandle } from "../lib/audio";
import { vanillaSoundUrl } from "../lib/catalog";
import { useWaveform } from "../hooks/useWaveform";
import { useVanillaWaveform } from "../hooks/useVanillaWaveform";
import { usePlayhead } from "../hooks/usePlayhead";
import { WaveformCanvas } from "./WaveformCanvas";
import { AmplitudeRuler, TimeRuler } from "./WaveformRulers";

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

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function WaveformEditor(props: Props) {
  const activeTake = props.replacement?.takes.find((take) => take.id === props.replacement?.activeTakeId) ?? null;
  const recipe = props.replacement?.edit ?? { trimStart: 0, trimEnd: null, gainDb: 0 };
  const [binWidth, setBinWidth] = useState(0);
  const { envelope: takeEnvelope, loading: takeLoading } = useWaveform(activeTake, binWidth || 640);
  const vanilla = useVanillaWaveform(activeTake ? null : props.variant, binWidth || 640);
  const [playing, setPlaying] = useState<"vanilla" | "custom" | null>(null);
  const [handle, setHandle] = useState<PreviewHandle | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [recordPeak, setRecordPeak] = useState(0);
  const [recordError, setRecordError] = useState("");
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const recorder = useRef<MicrophoneRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const playheadTime = usePlayhead(handle);

  const envelope = activeTake ? takeEnvelope : vanilla.envelope;
  const loading = activeTake ? takeLoading : vanilla.loading;
  const duration = activeTake?.duration ?? vanilla.duration ?? props.variant.duration ?? 1;
  const trimEnd = recipe.trimEnd ?? duration;
  const laneCount = Math.max(1, envelope.length || Math.min(2, props.variant.channels || 1));
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

  function watchPlayback(next: PreviewHandle, label: "vanilla" | "custom") {
    setHandle(next);
    void next.done.then(() => {
      setPlaying((current) => current === label ? null : current);
      setHandle((current) => current === next ? null : current);
    });
  }

  async function toggleVanilla() {
    if (!props.variant.objectHash) return;
    if (playing === "vanilla") { stopPreview(); setPlaying(null); return; }
    setPlaying("vanilla");
    try {
      watchPlayback(await previewRemote(vanillaSoundUrl(props.variant)), "vanilla");
    } catch {
      setPlaying(null);
    }
  }

  async function toggleCustom() {
    if (!activeTake) return;
    if (playing === "custom") { stopPreview(); setPlaying(null); return; }
    setPlaying("custom");
    try {
      watchPlayback(await previewEditedTake(activeTake, recipe), "custom");
    } catch {
      setPlaying(null);
    }
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

  const onSelectionChange = useCallback((start: number, end: number) => {
    props.onRecipe({
      ...recipe,
      trimStart: round3(Math.max(0, start)),
      trimEnd: end >= duration - 0.005 ? null : round3(end)
    });
  }, [recipe, duration, props.onRecipe]);

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

      <div className="waveform-card">
        <div className="waveform-grid" aria-label={`${laneCount}-channel amplitude waveform`}>
          <div className="ruler-corner" />
          <TimeRuler duration={duration} />
          <AmplitudeRuler laneCount={laneCount} />
          <WaveformCanvas
            envelope={envelope}
            duration={duration}
            selection={activeTake ? { start: recipe.trimStart, end: trimEnd } : null}
            onSelectionChange={onSelectionChange}
            playheadTime={playheadTime}
            interactive={Boolean(activeTake)}
            onWidth={setBinWidth}
          />
        </div>
        <div className="waveform-times">
          <span>{formatDuration(recipe.trimStart)}</span>
          <span>{loading ? "Reading waveform…" : vanilla.unavailable && !activeTake ? "Waveform unavailable — preview only" : formatDuration(duration)}</span>
          <span>{formatDuration(trimEnd)}</span>
        </div>
        {recording && <div className="recording-overlay"><span className="record-pulse" /><strong>{formatDuration(recordTime)}</strong><div className="meter"><i style={{ width: `${recordPeak * 100}%` }} /></div><span>Recording PCM · 48 kHz mono</span></div>}
      </div>

      {!activeTake && (
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
