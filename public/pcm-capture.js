class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const samples = inputs[0] && inputs[0][0];
    if (samples && samples.length) {
      const copy = new Float32Array(samples);
      let peak = 0;
      for (const sample of copy) peak = Math.max(peak, Math.abs(sample));
      this.port.postMessage({ samples: copy, peak }, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
