// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Host-side ports for this run. The build server runs two emulators, and a run picks one with
// ANDROID_SERIAL (chromium/android/server/README.md). adb forward and adb reverse rebind a host port
// without a word, so two runs at once on one host port would each read the other's device: the
// second emulator's runs use every host port plus 100. Ports on the device stay as they are, since
// each emulator has its own.
export function hostPort(base, env = process.env) {
  const emulator = /^emulator-(\d+)$/.exec(env.ANDROID_SERIAL ?? '');
  return emulator ? base + (Number(emulator[1]) - 5554) / 2 * 100 : base;
}
