declare module "@nikhilbadveli/custom-ogg-encoder" {
  export interface OggEncodeOptions {
    quality?: number;
    commentTags?: Array<{ tag: string; value: string }>;
  }
  export function encodeAudioBuffer(buffer: AudioBuffer, options?: OggEncodeOptions): Promise<Blob>;
}

interface Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
}
