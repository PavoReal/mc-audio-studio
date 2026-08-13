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

let previewSource: AudioBufferSourceNode | null = null;
let remotePreview: HTMLAudioElement | null = null;

export function stopPreview(): void {
  try { previewSource?.stop(); } catch { /* already stopped */ }
  previewSource = null;
  if (remotePreview) {
    remotePreview.pause();
    remotePreview.src = "";
    remotePreview = null;
  }
}

export async function previewEditedTake(take: AudioTake, recipe: EditRecipe): Promise<void> {
  stopPreview();
  const source = await decodeAudio(await readBlob(take.opfsPath));
  const context = audioContext();
  await context.resume();
  const node = context.createBufferSource();
  const gain = context.createGain();
  node.buffer = source;
  gain.gain.value = 10 ** (recipe.gainDb / 20);
  node.connect(gain).connect(context.destination);
  const end = Math.min(recipe.trimEnd ?? source.duration, source.duration);
  node.start(0, recipe.trimStart, Math.max(0, end - recipe.trimStart));
  previewSource = node;
  node.onended = () => { if (previewSource === node) previewSource = null; };
}

export async function previewRemote(url: string): Promise<void> {
  stopPreview();
  const audio = new Audio(url);
  remotePreview = audio;
  await audio.play();
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
