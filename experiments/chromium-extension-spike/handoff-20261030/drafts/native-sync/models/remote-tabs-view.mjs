import {displayDevices} from './tab-model.mjs';
import {resolveDeviceName} from './device-names.mjs';
import {hideOccurrences} from './shared-surfaces.mjs';
// Pure projection of already validated native-owned data. Never use renderer
// booleans, visibility or output as authorization to read, publish or navigate.
// Native code must bind the entire snapshot to one account/profile generation.
export function remoteTabsView({devices, ownId, now, sidecar, visibleSpaceIds, names, attachIcons}) {
  const rows = attachIcons(displayDevices(devices, ownId, {now}));
  return hideOccurrences(rows, sidecar, visibleSpaceIds)
    .map(device => ({...device, name: resolveDeviceName(names, device.deviceId, device.name)}));
}
