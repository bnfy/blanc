'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function processor() {
  let Processor;
  const acks = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/renderer/display-audio-worklet.js'), 'utf8'), {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (id) => acks.push(id) }; } },
    registerProcessor: (_name, value) => { Processor = value; },
  });
  const instance = new Processor();
  const send = (bytes, id = 1) => instance.port.onmessage({ data: { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), id } });
  return { instance, send, acks };
}
function encoded(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}
function render(instance, length) {
  const output = [new Float32Array(length), new Float32Array(length)];
  assert.equal(instance.process([], [output]), true);
  return output.map((channel) => [...channel]);
}
test('PCM frame boundaries survive arbitrary pipe chunk splits and retain stereo order', () => {
  const h = processor(); const bytes = encoded([0.25, -0.5, 0.5, -0.25]);
  h.send(bytes.slice(0, 3), 1);
  h.send(bytes.slice(3, 11), 2);
  h.send(bytes.slice(11), 3);
  assert.deepEqual(render(h.instance, 3), [[0.25, 0.5, 0], [-0.5, -0.25, 0]]);
  assert.deepEqual(h.acks, [1, 2, 3]);
});
test('buffer stays bounded, drops oldest stereo frames, and silences non-finite input', () => {
  const h = processor();
  h.send(encoded([...Array(24000).fill(0.25), 0.5, -0.5]));
  assert.equal(h.instance.length, 24000);
  const channels = render(h.instance, 12000);
  assert.equal(channels[0].at(-1), 0.5); assert.equal(channels[1].at(-1), -0.5);
  h.send(encoded([Infinity, NaN]));
  assert.deepEqual(render(h.instance, 1), [[0], [0]]);
});
