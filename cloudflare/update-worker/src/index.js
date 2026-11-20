// Blanc's update server for the Windows beta. The release it offers comes
// from release.json, which the Windows release stages write (W3 Task D1);
// with no version there it offers nothing.
import {makeWorker} from './worker.js';
import {CUP_PUBLIC_SPKI_HEX} from './cup-public-key.js';
import release from './release.json';
import logoLight from '../assets/logo_light.bmp';
import logoDark from '../assets/logo_dark.bmp';

export default makeWorker({publicSpkiHex: CUP_PUBLIC_SPKI_HEX, release, icons: {light: logoLight, dark: logoDark}});
