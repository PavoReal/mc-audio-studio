/* Dedicated classic worker wrapper for the pinned Xiph libogg/libvorbis WASM build. */
importScripts("/assets/ogg-encoder.umd.js");

async function encodeWhenRuntimeIsReady(audio) {
  const encoder = self["sl-web-ogg"];
  const deadline = performance.now() + 10_000;
  while (true) {
    try {
      return await encoder.encodeAudioBuffer(audio, { quality: 0.5 });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("middle-layer.js import") || performance.now() >= deadline) {
        throw error;
      }
      // The pinned Emscripten UMD initializes WASM just after importScripts returns.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

self.onmessage = async (event) => {
  const { id, channels, sampleRate } = event.data;
  try {
    const audio = {
      numberOfChannels: channels.length,
      sampleRate,
      length: channels[0]?.length ?? 0,
      getChannelData(index) { return channels[index]; }
    };
    const blob = await encodeWhenRuntimeIsReady(audio);
    self.postMessage({ id, ok: true, blob });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
