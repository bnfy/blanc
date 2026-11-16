// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Host-side ports for this run. The build server runs two emulators, and a run picks one with
// ANDROID_SERIAL (chromium/android/server/README.md). adb forward and adb reverse rebind a host port
// without a word, so two runs at once on one host port would each read the other's device: the
// second emulator's runs use every host port plus 100. Ports on the device stay as they are, since
// each emulator has its own.
export function hostPort(base, env = process.env) {
  const emulator = /^emulator-(\d+)$/.exec(env.ANDROID_SERIAL ?? '');
  if (!emulator) return base;
  const console = Number(emulator[1]);
  // Emulators take even console ports from 5554; anything else has no port of its own here.
  if (console < 5554 || console % 2) throw Error(`${env.ANDROID_SERIAL} isn't an emulator from 5554 up in steps of 2`);
  return base + (console - 5554) / 2 * 100;
}
