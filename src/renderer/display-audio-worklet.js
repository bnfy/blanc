'use strict';
class MonitorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 250 ms maximum buffering. Drop old audio rather than growing latency.
    this.buffer = new Float32Array(48000 / 4 * 2);
    this.read = 0; this.length = 0;
    this.remainder = new Uint8Array(0);
    this.port.onmessage = ({ data }) => {
      const incoming = new Uint8Array(data.buffer);
      const bytes = new Uint8Array(this.remainder.length + incoming.length);
      bytes.set(this.remainder); bytes.set(incoming, this.remainder.length);
      const full = bytes.length - bytes.length % 8;
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < full; i += 4) {
        if (this.length === this.buffer.length) { this.read = (this.read + 1) % this.buffer.length; this.length--; }
        const value = view.getFloat32(i, true);
        this.buffer[(this.read + this.length++) % this.buffer.length] = Number.isFinite(value) ? value : 0;
      }
      this.remainder = bytes.slice(full);
      this.port.postMessage(data.id);
    };
  }
  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    for (let i = 0; i < left.length; i++) {
      if (this.length >= 2) {
        left[i] = this.buffer[this.read]; right[i] = this.buffer[(this.read + 1) % this.buffer.length];
        this.read = (this.read + 2) % this.buffer.length; this.length -= 2;
      }
    }
    return true;
  }
}
registerProcessor('blanc-monitor', MonitorProcessor);
