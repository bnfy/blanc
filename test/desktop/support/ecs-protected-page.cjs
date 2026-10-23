'use strict';
// Controlled loopback page for updater successors that have no CDP port.
// Uses the same public CENC fixture and production server as castLabs VMP Lab.
// No license requests/responses, identifiers, or media bytes leave this page.
function licenseStatus(bytes) {
  function field(buffer, wanted) {
    let offset = 0;
    const integer = () => {
      let value = 0, shift = 0;
      for (let count = 0; count < 6 && offset < buffer.length; count++) {
        const byte = buffer[offset++]; value += (byte & 127) * 2 ** shift;
        if (!(byte & 128)) return value;
        shift += 7;
      }
      throw Error('Invalid protobuf integer');
    };
    while (offset < buffer.length) {
      const tag = integer(), wire = tag % 8, number = Math.floor(tag / 8);
      if (wire === 0) { const value = integer(); if (number === wanted) return value; }
      else if (wire === 2) {
        const size = integer(); if (offset + size > buffer.length) throw Error('Truncated protobuf');
        const value = buffer.subarray(offset, offset + size); offset += size;
        if (number === wanted) return value;
      } else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4;
      else throw Error('Unsupported protobuf wire');
    }
    return null;
  }
  const body = field(new Uint8Array(bytes), 2);
  return body instanceof Uint8Array ? field(body, 10) : null;
}
function protectedPage(token, { muted = true } = {}) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw Error('Invalid probe token');
  return `<!doctype html><meta charset="utf-8"><title>ECS protected playback check</title>
<button id="play" autofocus>Play protected test video</button><video id="video" ${muted ? 'muted' : ''} playsinline controls></video>
<script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.16.3/shaka-player.compiled.min.js"></script>
<script>
const token = ${JSON.stringify(token)};
const licenseStatus = ${licenseStatus.toString()};
let started = false;
const send = (route, data) => fetch('/' + route, {method:'POST',headers:{'Content-Type':'application/json','X-Blanc-Probe':token},body:JSON.stringify(data)});
document.getElementById('play').onclick = async () => {
 if (started) return; started = true;
 const result = {status:null, encryptedEvents:0, mediaErrors:[], mediaKeys:false};
 try {
  if (!window.shaka) throw Error('Player unavailable');
  shaka.polyfill.installAll();
  const video = document.getElementById('video');
  video.addEventListener('encrypted', () => result.encryptedEvents++);
  video.addEventListener('error', () => result.mediaErrors.push(video.error?.code || -1));
  const player = new shaka.Player();
  player.addEventListener('error', event => result.mediaErrors.push(event.detail.code));
  player.getNetworkingEngine().registerResponseFilter((type, response) => {
   if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
    const status = licenseStatus(response.data); if (status !== null) result.status = status;
   }
  });
  player.configure({drm:{servers:{'com.widevine.alpha':'https://proxy.widevine.com/proxy'},advanced:{'com.widevine.alpha':{videoRobustness:'SW_SECURE_DECODE',audioRobustness:'SW_SECURE_CRYPTO'}}}});
  await player.attach(video);
  await player.load('https://storage.googleapis.com/wvmedia/cenc/h264/tears/tears.mpd');
  await video.play(); result.first = video.currentTime;
  await new Promise(resolve => setTimeout(resolve,5000));
  result.second = video.currentTime; result.mediaKeys = !!video.mediaKeys;
  result.paused = video.paused; result.error = video.error?.code || null; result.muted = video.muted;
 } catch (error) { result.failure = String(error.message).slice(0,160); }
 await send('result', result);
};
send('ready', {ready:!!window.shaka});
</script>`;
}
module.exports = { licenseStatus, protectedPage };
