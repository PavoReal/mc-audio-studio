import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Copy, FileAudio, Mic2, Pause, Play, RotateCcw, Upload, Volume2, X } from "lucide-react";
import type { AudioTake, CatalogVariant, EditRecipe, SoundReplacement } from "../types";
import { formatDuration, relativeSoundPath } from "../lib/format";
import { canPlayOggVorbis, MicrophoneRecorder, previewBuffer, previewEditedTake, previewRemote, stopPreview, unlockAudio, type PreviewHandle } from "../lib/audio";
import { vanillaSoundUrl } from "../lib/catalog";
import { fetchVanillaBuffer } from "../lib/vanillaAudio";
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
type PreviewSource = "vanilla" | "custom";

export function WaveformEditor(props: Props) {
  const activeTake = props.replacement?.takes.find((take) => take.id === props.replacement?.activeTakeId) ?? null;
  const recipe = props.replacement?.edit ?? { trimStart: 0, trimEnd: null, gainDb: 0 };
  const [binWidth, setBinWidth] = useState(0);
  const { envelope: takeEnvelope, loading: takeLoading } = useWaveform(activeTake, binWidth || 640);
  const vanilla = useVanillaWaveform(activeTake ? null : props.variant, binWidth || 640);
  const [previewSource, setPreviewSource] = useState<PreviewSource | null>(null);
  const [playing, setPlaying] = useState(false);
  const [handle, setHandle] = useState<PreviewHandle | null>(null);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [playbackError, setPlaybackError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [recordPeak, setRecordPeak] = useState(0);
  const [recordError, setRecordError] = useState("");
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const recorder = useRef<MicrophoneRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);
  const sourceRef = useRef<PreviewSource | null>(null);
  const playingRef = useRef(false);
  const positionRef = useRef(0);
  const playbackRequest = useRef(0);
  const resumeAfterDrag = useRef(false);
  const playheadTime = usePlayhead(handle, playing, playheadPosition);

  const envelope = activeTake ? takeEnvelope : vanilla.envelope;
  const loading = activeTake ? takeLoading : vanilla.loading;
  const duration = activeTake?.duration ?? vanilla.duration ?? props.variant.duration ?? 1;
  const trimEnd = recipe.trimEnd ?? duration;
  const laneCount = Math.max(1, envelope.length || Math.min(2, props.variant.channels || 1));
  const eventLabel = props.variant.events[0]?.replaceAll(".", " ") ?? "Unmapped sound";

  function setPlaybackRunning(value: boolean) {
    playingRef.current = value;
    setPlaying(value);
  }

  function setPlaybackPosition(value: number) {
    positionRef.current = value;
    setPlayheadPosition(value);
  }

  function clearPlaybackHandle() {
    playbackRequest.current += 1;
    stopPreview();
    handleRef.current = null;
    setHandle(null);
    setPlaybackRunning(false);
  }

  useEffect(() => {
    playbackRequest.current += 1;
    stopPreview();
    handleRef.current = null;
    sourceRef.current = null;
    playingRef.current = false;
    positionRef.current = 0;
    setHandle(null);
    setPreviewSource(null);
    setPlaying(false);
    setPlayheadPosition(0);
    setPlaybackError("");
    return () => {
      playbackRequest.current += 1;
      stopPreview();
    };
  }, [props.variant.path, activeTake?.id]);
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

  function watchPlayback(next: PreviewHandle, label: PreviewSource) {
    handleRef.current = next;
    sourceRef.current = label;
    setHandle(next);
    setPreviewSource(label);
    setPlaybackPosition(next.getTime());
    setPlaybackRunning(true);
    void next.done.then(() => {
      if (handleRef.current !== next) return;
      setPlaybackPosition(next.getTime());
      handleRef.current = null;
      setHandle(null);
      setPlaybackRunning(false);
    });
  }

  async function startPlayback(label: PreviewSource) {
    const request = playbackRequest.current + 1;
    playbackRequest.current = request;
    stopPreview();
    handleRef.current = null;
    setHandle(null);
    setPlaybackRunning(false);
    setPlaybackError("");
    try {
      const next = label === "vanilla"
        ? canPlayOggVorbis()
          ? await previewRemote(vanillaSoundUrl(props.variant), positionRef.current)
          : await previewBuffer(() => fetchVanillaBuffer(props.variant), positionRef.current)
        : activeTake ? await previewEditedTake(activeTake, recipe, positionRef.current) : null;
      if (!next) return;
      if (playbackRequest.current !== request) {
        next.stop();
        return;
      }
      watchPlayback(next, label);
    } catch (error) {
      if (playbackRequest.current !== request) return;
      setPlaybackRunning(false);
      const message = error instanceof Error ? error.message : "";
      if (message !== "Preview was replaced.") setPlaybackError(message || "Playback could not be started.");
    }
  }

  function pausePlayback() {
    const current = handleRef.current;
    if (!current || !playingRef.current) return;
    current.pause();
    setPlaybackPosition(current.getTime());
    setPlaybackRunning(false);
  }

  async function resumePlayback() {
    const current = handleRef.current;
    if (!current || playingRef.current) return;
    try {
      await current.resume();
      if (handleRef.current === current) setPlaybackRunning(true);
    } catch {
      if (handleRef.current === current) setPlaybackRunning(false);
    }
  }

  function togglePreview(label: PreviewSource) {
    // Resume the audio context while the tap gesture is still active; iOS
    // Safari refuses to start a suspended context outside a user gesture.
    unlockAudio();
    if (label === "vanilla" && !props.variant.objectHash) return;
    if (label === "custom" && !activeTake) return;
    if (sourceRef.current === label && handleRef.current) {
      if (playingRef.current) pausePlayback();
      else {
        const end = label === "custom" ? trimEnd : duration;
        if (positionRef.current >= end - 0.005) {
          clearPlaybackHandle();
          void startPlayback(label);
        } else {
          void resumePlayback();
        }
      }
      return;
    }
    void startPlayback(label);
  }

  function onPlayheadDragStart() {
    resumeAfterDrag.current = playingRef.current;
    if (playingRef.current) pausePlayback();
  }

  function onPlayheadChange(time: number) {
    let minimum = 0;
    let maximum = duration;
    if (sourceRef.current === "custom") {
      minimum = recipe.trimStart;
      maximum = trimEnd;
    }
    const requested = Math.max(minimum, Math.min(maximum, time));
    const current = handleRef.current;
    setPlaybackPosition(current ? current.seek(requested) : requested);
  }

  function onPlayheadDragEnd() {
    const shouldResume = resumeAfterDrag.current;
    resumeAfterDrag.current = false;
    if (shouldResume) void resumePlayback();
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
      clearPlaybackHandle();
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
            onPlayheadDragStart={onPlayheadDragStart}
            onPlayheadChange={onPlayheadChange}
            onPlayheadDragEnd={onPlayheadDragEnd}
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
        <button className="transport" onClick={() => togglePreview("vanilla")} disabled={!props.variant.objectHash} title="Preview vanilla reference">
          {previewSource === "vanilla" && playing ? <Pause size={17} /> : <Play size={17} />}<span>Vanilla</span>
        </button>
        <button className="transport primary" onClick={() => togglePreview("custom")} disabled={!activeTake} title="Preview custom sound">
          {previewSource === "custom" && playing ? <Pause size={17} /> : <Play size={17} />}<span>Custom</span>
        </button>
        <span className="transport-divider" />
        <button className={`record-button ${recording ? "active" : ""}`} onClick={() => void toggleRecording()} disabled={Boolean(props.busy)}>
          {recording ? <CircleStop size={19} /> : <Mic2 size={19} />}<span>{recording ? "Stop" : "Record"}</span>
        </button>
        {recording && <button className="transport" onClick={cancelRecording}><X size={17} /><span>Cancel</span></button>}
        <button className="transport" onClick={() => fileInput.current?.click()} disabled={Boolean(props.busy)}><Upload size={17} /><span>Import</span></button>
        <input ref={fileInput} className="sr-only" type="file" accept="audio/wav,audio/ogg,audio/mpeg,audio/flac,.wav,.ogg,.mp3,.flac" onChange={(event) => event.target.files?.[0] && void props.onImport(event.target.files[0])} />
      </div>
      {(microphones.length > 1 || recordError || playbackError) && <div className="microphone-options">
        {microphones.length > 1 && <label>Microphone <select aria-label="Microphone device" value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}
        {(recordError || playbackError) && <p role="alert">{recordError || playbackError}</p>}
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
