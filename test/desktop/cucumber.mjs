// Cucumber configuration for the DESKTOP acceptance run. The shared, platform-
// neutral .feature files live in spec/acceptance/; this profile binds them to
// the desktop (Electron) step definitions in test/desktop/.
//
// Profiles:
//   runnable  - the subset currently implemented against the shipping app
//               (drivable via main-process state). This is what CI runs green.
//   dry       - `runnable` under --dry-run: verifies every selected step
//               resolves to a definition without launching Electron.
//   default   - every desktop-applicable scenario (`not @mobile`). Runs the
//               implemented subset and reports the rest as UNDEFINED — an
//               honest view of the remaining backlog.
//
// Run with, e.g.:  xvfb-run -a npx cucumber-js -c test/desktop/cucumber.mjs -p runnable

const common = {
  // The platform-neutral contract lives in spec/acceptance/. The 1Password fill
  // SPIKE is desktop-and-spike-only, so its feature lives under test/desktop/.
  paths: ['spec/acceptance/**/*.feature', 'test/desktop/features/**/*.feature'],
  require: ['test/desktop/support/**/*.js', 'test/desktop/steps/**/*.js'],
};

// The scenarios implemented in steps/ (by their stable @F#-n ids).
const RUNNABLE = [
  '@F1-1', '@F1-2',
  '@F2-1', '@F2-2', '@F2-3', '@F2-4',
  '@F3-1', '@F3-2', '@F3-3', '@F3-4', '@F3-5',
  '@F4-1', '@F4-2', '@F4-3', '@F4-4', '@F4-5',
  '@F5-1', '@F5-2', '@F5-3', '@F5-4', '@F5-5', '@F5-6',
  '@F7-1', '@F7-2',
  '@F9-1', '@F9-2',
  '@F10-1', '@F10-2',
  '@F11-1', '@F11-2',
  '@F12-3',
  '@F14-1', '@F14-2', '@F14-3', '@F14-4',
  '@F15-1', '@F15-2',
  '@F16-2', '@F16-3', '@F16-4', '@F16-5', '@F16-6', '@F16-7',
  '@F17-1', '@F17-2',
  '@F19-2', '@F19-3',
  '@F28-1', '@F28-2', '@F28-3', '@F28-4', '@F28-5', '@F28-6',
  '@F28-7', '@F28-8', '@F28-9', '@F28-10', '@F28-11', '@F28-12',
  '@F28-13', '@F28-14', '@F28-15', '@F28-16', '@F28-17',
  '@F29-1', '@F29-2',
  '@F30-1', '@F30-2', '@F30-3',
  '@F31-1', '@F31-2', '@F31-3',
  '@F32-1', '@F32-2',
  '@F33-1',
  '@F34-1',
  '@F35-1',
  '@F36-1',
  '@spike-1p-picker', // 1Password fill SPIKE — desktop-only picker scenarios
].join(' or ');

export default { ...common, tags: 'not @mobile' };
export const runnable = { ...common, tags: RUNNABLE };
export const dry = { ...common, tags: RUNNABLE, dryRun: true };
