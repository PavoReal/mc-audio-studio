/**
 * Fallback Ogg Vorbis decoding for browsers without native support. Safari
 * (macOS and iOS) can neither decode Ogg Vorbis with decodeAudioData nor
 * play it with media elements, so vanilla Minecraft sounds and imported
 * .ogg takes decode through a WebAssembly decoder there instead. The
 * decoder loads lazily so browsers with native support never download it.
 */

const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53]; // "OggS"

export function looksLikeOgg(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(OGG_MAGIC.length, data.byteLength));
  return OGG_MAGIC.every((value, index) => bytes[index] === value);
}

/** Resolves to null when the data is not an Ogg stream or cannot be decoded. */
export async function decodeOggFallback(data: ArrayBuffer): Promise<AudioBuffer | null> {
  if (!looksLikeOgg(data)) return null;
  try {
    const { OggVorbisDecoder } = await import("@wasm-audio-decoders/ogg-vorbis");
    const decoder = new OggVorbisDecoder();
    try {
      await decoder.ready;
      const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(new Uint8Array(data));
      if (!samplesDecoded || channelData.length === 0) return null;
      const buffer = new AudioBuffer({ length: samplesDecoded, numberOfChannels: channelData.length, sampleRate });
      channelData.forEach((channel, index) => buffer.copyToChannel(channel.subarray(0, samplesDecoded), index));
      return buffer;
    } finally {
      decoder.free();
    }
  } catch {
    return null;
  }
}
