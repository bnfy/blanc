// Cucumber configuration for the ANDROID acceptance run: the shared, platform-neutral .feature
// files in spec/acceptance/, bound to step definitions that drive Blanc for Android on the build
// server's emulator over adb, UI Automator and DevTools (steps/, support/).
//
// Profiles:
//   androidSmoke  - the scenarios bound so far (RUNNABLE, by stable @F#-n id). Every one passes,
//                   fails or reports undefined; none is skipped.
//   dry           - androidSmoke under --dry-run: every selected step resolves, no emulator.
//
// Run from the repository root on the build server (tests/android/acceptance/run.sh):
//   cucumber-js -c chromium/tests/android/acceptance/cucumber.mjs -p androidSmoke

const here = 'chromium/tests/android/acceptance';
const common = {
  paths: ['spec/acceptance/**/*.feature'],
  import: [`${here}/support/**/*.mjs`, `${here}/steps/**/*.mjs`],
  format: ['progress', ...(process.env.BLANC_ANDROID_REPORT ? [['json', process.env.BLANC_ANDROID_REPORT]] : [])],
};

// The @all scenarios of F2–F8, F12 and F18 that Android has built, and the phone-only F31 and F56.
// Left out: F3-2 (the Island's dots, A3), F4-4 (session isolation, no observable on a phone),
// F5-2/F5-4/F5-5/F5-9–F5-11 (search engines and suggestions, A5), F7-2 (/downloads, A5), and
// F12-8 (site controls reporting HTTPS: no Android surface yet).
export const RUNNABLE = [
  '@F2-1', '@F2-2', '@F2-3', '@F2-4', '@F2-6',
  '@F3-1', '@F3-3', '@F3-4', '@F3-5',
  '@F4-1', '@F4-2', '@F4-3', '@F4-5',
  '@F5-1', '@F5-3', '@F5-6', '@F5-8',
  '@F6-1', '@F6-2',
  '@F7-1',
  '@F8-1',
  '@F12-1', '@F12-2', '@F12-3', '@F12-4', '@F12-5', '@F12-6',
  '@F18-1',
  '@F31-11',
  '@F56-1', '@F56-2', '@F56-3',
];

const tags = RUNNABLE.join(' or ');

export default {...common, tags};
export const androidSmoke = {...common, tags};
export const dry = {...common, tags, dryRun: true};
