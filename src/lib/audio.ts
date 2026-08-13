import type { AudioTake, EditRecipe } from "../types";
import { readBlob, writeBlobAtomic } from "./opfs";

let sharedAudioContext: AudioContext | null = null;

export function audioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  if (blob.size > 512 * 1024 ** 2) {
    throw new Error("Audio larger than 512 MiB can be preserved but not edited in this release.");
  }
  return audioContext().decodeAudioData(await blob.arrayBuffer());
}

export interface WaveformPoint {
  min: number;
  max: number;
  rms: number;
  clipped: boolean;
}

export type WaveformEnvelope = WaveformPoint[][];

export function waveform(buffer: AudioBuffer, bins = 640): WaveformEnvelope {
  const binCount = Math.max(1, Math.min(bins, Math.max(1, buffer.length)));
  return Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
    const samples = buffer.getChannelData(channel);
    return Array.from({ length: binCount }, (_, bin): WaveformPoint => {
      const start = Math.floor(bin * samples.length / binCount);
      const end = Math.max(start + 1, Math.floor((bin + 1) * samples.length / binCount));
      let minimum = 1;
      let maximum = -1;
      let squareSum = 0;
      for (let index = start; index < end && index < samples.length; index += 1) {
        const sample = samples[index] ?? 0;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
        squareSum += sample * sample;
      }
      const count = Math.max(1, Math.min(end, samples.length) - start);
      return {
        min: minimum === 1 ? 0 : minimum,
        max: maximum === -1 ? 0 : maximum,
        rms: Math.sqrt(squareSum / count),
        clipped: maximum >= 0.999 || minimum <= -0.999
      };
    });
  });
}

export async function saveTake(
  projectId: string,
  targetPath: string,
  blob: Blob,
  label: string,
  origin: AudioTake["origin"]
): Promise<AudioTake> {
  const decoded = await decodeAudio(blob);
  const id = crypto.randomUUID();
  const extension = blob.type.includes("wav") ? "wav" : blob.type.includes("ogg") ? "ogg" : "audio";
  const safeTarget = targetPath.replace(/[^a-z0-9._-]+/gi, "_");
  const opfsPath = `projects/${projectId}/takes/${safeTarget}/${id}.${extension}`;
  await writeBlobAtomic(opfsPath, blob);
  return {
    id,
    label: label.trim() || `Take ${new Date().toLocaleTimeString()}`,
    opfsPath,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
    createdAt: new Date().toISOString(),
    origin
  };
}

export async function renderTake(
  take: AudioTake,
  recipe: EditRecipe,
  target: { sampleRate: number; channels: number }
): Promise<{ buffer: AudioBuffer; peakDb: number }> {
  const source = await decodeAudio(await readBlob(take.opfsPath));
  const trimStart = Math.max(0, Math.min(recipe.trimStart, source.duration));
  const trimEnd = Math.max(trimStart, Math.min(recipe.trimEnd ?? source.duration, source.duration));
  if (trimEnd - trimStart <= 0.01) throw new Error("The trim selection is empty.");
  const sampleRate = target.sampleRate || source.sampleRate;
  const channels = Math.max(1, Math.min(2, target.channels || source.numberOfChannels));
  const length = Math.ceil((trimEnd - trimStart) * sampleRate);
  const offline = new OfflineAudioContext(channels, length, sampleRate);
  const sourceNode = offline.createBufferSource();
  sourceNode.buffer = source;
  const gain = offline.createGain();
  gain.gain.value = 10 ** (recipe.gainDb / 20);
  sourceNode.connect(gain).connect(offline.destination);
  sourceNode.start(0, trimStart, trimEnd - trimStart);
  const rendered = await offline.startRendering();
  let peak = 0;
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    for (const sample of rendered.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
  }
  return { buffer: rendered, peakDb: peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY };
}

export async function encodeVorbis(buffer: AudioBuffer): Promise<Blob> {
  const worker = new Worker("/ogg-encoder.worker.js");
  const id = crypto.randomUUID();
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    new Float32Array(buffer.getChannelData(index))
  );
  return new Promise<Blob>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Vorbis encoding timed out."));
    }, 120_000);
    worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; blob?: Blob; error?: string }>) => {
      if (event.data.id !== id) return;
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok && event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error || "Vorbis encoding failed."));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "Vorbis encoder worker failed."));
    };
    worker.postMessage({ id, channels, sampleRate: buffer.sampleRate }, channels.map((channel) => channel.buffer));
  });
}

let activePreview: PreviewHandle | null = null;
let previewRequest = 0;

export function stopPreview(): void {
  previewRequest += 1;
  const current = activePreview;
  activePreview = null;
  current?.stop();
}

export interface PreviewHandle {
  /** Current playback position in source-time seconds. */
  getTime(): number;
  pause(): void;
  /** Seeks to source-time seconds and returns the clamped position. */
  seek(seconds: number): number;
  resume(): Promise<void>;
  stop(): void;
  /** Resolves only after natural completion, an error, or an explicit stop. */
  done: Promise<void>;
}

function clampPosition(value: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, Number.isFinite(value) ? value : start));
}

function setActivePreview(handle: PreviewHandle): void {
  activePreview = handle;
  void handle.done.then(() => {
    if (activePreview === handle) activePreview = null;
  });
}

export async function previewEditedTake(take: AudioTake, recipe: EditRecipe, startAt = recipe.trimStart): Promise<PreviewHandle> {
  stopPreview();
  const request = previewRequest;
  const source = await decodeAudio(await readBlob(take.opfsPath));
  if (request !== previewRequest) throw new Error("Preview was replaced.");
  const context = audioContext();
  const gain = context.createGain();
  gain.gain.value = 10 ** (recipe.gainDb / 20);
  gain.connect(context.destination);
  const start = clampPosition(recipe.trimStart, 0, source.duration);
  const end = clampPosition(recipe.trimEnd ?? source.duration, start, source.duration);
  let position = clampPosition(startAt, start, end);
  if (position >= end - 0.005) position = start;
  let node: AudioBufferSourceNode | null = null;
  let startedAt = 0;
  let startedFrom = position;
  let playing = false;
  let terminal = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });

  function getTime(): number {
    return playing ? Math.min(end, startedFrom + context.currentTime - startedAt) : position;
  }

  function stopNode(): void {
    const current = node;
    node = null;
    if (!current) return;
    current.onended = null;
    try { current.stop(); } catch { /* already stopped */ }
    current.disconnect();
  }

  function finish(): void {
    if (terminal) return;
    position = end;
    playing = false;
    node = null;
    terminal = true;
    gain.disconnect();
    resolveDone();
  }

  function startNode(): void {
    if (terminal || position >= end) {
      finish();
      return;
    }
    const next = context.createBufferSource();
    next.buffer = source;
    next.connect(gain);
    startedFrom = position;
    startedAt = context.currentTime;
    playing = true;
    node = next;
    next.onended = () => {
      if (node !== next || !playing) return;
      finish();
    };
    next.start(0, position, end - position);
  }

  const handle: PreviewHandle = {
    getTime,
    pause: () => {
      if (!playing || terminal) return;
      position = getTime();
      playing = false;
      stopNode();
    },
    seek: (seconds) => {
      const wasPlaying = playing;
      if (wasPlaying) {
        playing = false;
        stopNode();
      }
      position = clampPosition(seconds, start, end);
      if (wasPlaying) startNode();
      return position;
    },
    resume: async () => {
      if (playing || terminal) return;
      await context.resume();
      if (terminal) return;
      startNode();
    },
    stop: () => {
      if (terminal) return;
      if (playing) position = getTime();
      playing = false;
      terminal = true;
      stopNode();
      gain.disconnect();
      resolveDone();
    },
    done
  };
  setActivePreview(handle);
  try {
    await handle.resume();
    return handle;
  } catch (error) {
    handle.stop();
    throw error;
  }
}

export async function previewRemote(url: string, startAt = 0): Promise<PreviewHandle> {
  stopPreview();
  const request = previewRequest;
  const audio = new Audio(url);
  audio.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      if (audio.readyState >= 1) {
        resolve();
        return;
      }
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("The preview audio could not be loaded.")); };
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", loaded);
        audio.removeEventListener("error", failed);
      };
      audio.addEventListener("loadedmetadata", loaded);
      audio.addEventListener("error", failed);
      audio.load();
    });
  } catch (error) {
    audio.src = "";
    throw error;
  }
  if (request !== previewRequest) {
    audio.src = "";
    throw new Error("Preview was replaced.");
  }
  const end = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY;
  let position = clampPosition(startAt, 0, end);
  if (Number.isFinite(end) && position >= end - 0.005) position = 0;
  let terminal = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });

  function finish(): void {
    if (terminal) return;
    position = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime;
    terminal = true;
    resolveDone();
  }

  audio.addEventListener("ended", finish);
  audio.addEventListener("error", finish);
  const handle: PreviewHandle = {
    getTime: () => terminal || audio.paused ? position : audio.currentTime,
    pause: () => {
      if (terminal || audio.paused) return;
      position = audio.currentTime;
      audio.pause();
    },
    seek: (seconds) => {
      position = clampPosition(seconds, 0, end);
      audio.currentTime = position;
      return audio.currentTime;
    },
    resume: async () => {
      if (terminal || !audio.paused) return;
      audio.currentTime = position;
      await audio.play();
    },
    stop: () => {
      if (terminal) return;
      position = audio.currentTime;
      terminal = true;
      audio.pause();
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      audio.src = "";
      resolveDone();
    },
    done
  };
  setActivePreview(handle);
  try {
    handle.seek(position);
    await handle.resume();
    return handle;
  } catch (error) {
    handle.stop();
    throw error;
  }
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function pcmToWav(chunks: Float32Array[], sampleRate: number): Blob {
  const samples = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const limited = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, limited < 0 ? limited * 0x8000 : limited * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export class MicrophoneRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  peak = 0;
  startedAt = 0;

  async start(deviceId?: string): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    this.context = new AudioContext({ sampleRate: 48_000 });
    await this.context.audioWorklet.addModule("/pcm-capture.js");
    const input = this.context.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.context, "pcm-capture");
    this.worklet.port.onmessage = (event: MessageEvent<{ samples: Float32Array; peak: number }>) => {
      this.chunks.push(new Float32Array(event.data.samples));
      this.peak = event.data.peak;
    };
    input.connect(this.worklet);
    this.worklet.connect(this.context.destination);
    this.startedAt = performance.now();
  }

  async stop(): Promise<Blob> {
    if (!this.context) throw new Error("Recording has not started.");
    const rate = this.context.sampleRate;
    this.dispose();
    return pcmToWav(this.chunks, rate);
  }

  cancel(): void {
    this.dispose();
    this.chunks = [];
  }

  private dispose(): void {
    this.worklet?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.worklet = null;
    this.stream = null;
    this.context = null;
  }
}
