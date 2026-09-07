'use strict';
window.prepareAudio = async () => {
  const audio = new AudioContext({ sampleRate: 48000 });
  await audio.audioWorklet.addModule('display-audio-worklet.js');
  const node = new AudioWorkletNode(audio, 'blanc-monitor', { outputChannelCount: [2] });
  node.connect(audio.destination);
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.type === 'pcm' && event.data.buffer instanceof ArrayBuffer) {
      node.port.postMessage(event.data, [event.data.buffer]);
    }
  });
  node.port.onmessage = ({ data }) => window.postMessage({ type: 'pcm-ack', id: data }, '*');
  await audio.resume();
};
