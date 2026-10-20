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
  paths: ['spec/acceptance/**/*.feature'],
  require: ['test/desktop/support/**/*.js', 'test/desktop/steps/**/*.js'],
  import: ['test/desktop/tab-import.mjs'],
};

// The scenarios implemented in steps/ (by their stable @F#-n ids).
const RUNNABLE = [
  '@F1-3', '@F1-4', '@F1-5', '@F1-6', '@F1-7', '@F1-8', '@F1-9', '@F1-10', '@F1-11', '@F1-12', '@F1-13', '@F1-14', '@F1-15', '@F1-16', '@F1-17', '@F1-18', '@F1-19', '@F1-20', '@F1-21', '@F1-22', '@F1-23', '@F1-24', '@F1-25', '@F1-26', '@F1-27', '@F1-28', '@F1-29', '@F1-30', '@F1-31', '@F1-32', '@F1-33', '@F1-34', '@F1-35', '@F1-36', '@F1-37', '@F1-38', '@F1-39', '@F1-40', '@F1-41', '@F1-42', '@F1-43', '@F1-44',
  '@F41-12', '@F41-13', '@F41-14', '@F41-15', '@F41-16', '@F41-17', '@F41-18', '@F41-19', '@F41-20', '@F41-21', '@F41-22', '@F41-23', '@F41-24', '@F41-25', '@F41-26', '@F41-27', '@F41-28', '@F41-29', '@F41-30', '@F41-31', '@F41-32', '@F41-33', '@F41-34', '@F41-35', '@F41-36', '@F41-37', '@F41-38', '@F41-39',
  '@F41-1', '@F41-2', '@F41-3', '@F41-4', '@F41-5', '@F41-6', '@F41-7', '@F41-8', '@F41-9', '@F41-10', '@F41-11',
  '@F2-1', '@F2-2', '@F2-3', '@F2-4',
  '@F2-5', '@F2-6', '@F2-7', '@F2-8', '@F2-9', '@F2-10', '@F2-11',
  '@F3-1', '@F3-2', '@F3-4', '@F3-5',
  '@F3-6', '@F3-7', '@F3-8', '@F3-9', '@F3-10', '@F3-11', '@F3-12', '@F3-13', '@F3-14', '@F3-15', '@F3-16', '@F3-17', '@F3-22', '@F3-23', '@F3-24', '@F3-25', '@F3-26', '@F3-27', '@F3-28', '@F3-29', '@F3-30', '@F3-31', '@F3-32', '@F3-18', '@F3-19', '@F3-20', '@F3-21',
  '@F4-4', '@F4-5',
  '@F5-1', '@F5-2', '@F5-3', '@F5-4', '@F5-5', '@F5-6', '@F5-7', '@F5-8', '@F5-9', '@F5-10', '@F5-11',
  '@F7-2', '@F7-3', '@F7-4',
  '@F9-1', '@F9-2', '@F9-3',
  '@F10-2', '@F10-3',
  '@F12-3', '@F12-4', '@F12-5', '@F12-6', '@F12-7', '@F12-8', '@F12-9',
  '@F14-1', '@F14-2', '@F14-3', '@F14-4', '@F14-5',
  '@F16-2', '@F16-3', '@F16-4', '@F16-5', '@F16-6', '@F16-7', '@F16-8', '@F16-9', '@F16-10',
  '@F27-4', '@F27-5', '@F27-6', '@F27-7', '@F27-8', '@F27-9', '@F27-10', '@F27-11', '@F27-12', '@F27-13',
  '@F17-1', '@F17-3',
  '@F19-2', '@F19-3',
  '@F20-1', '@F20-2', '@F20-3', '@F20-4',
  '@F28-1', '@F28-2', '@F28-3', '@F28-4', '@F28-5', '@F28-6',
  '@F28-7', '@F28-8', '@F28-9', '@F28-10', '@F28-11', '@F28-12',
  '@F28-13', '@F28-14', '@F28-15', '@F28-16', '@F28-17',
  '@F30-1', '@F30-2', '@F30-3', '@F30-4', '@F30-5',
  '@F31-1', '@F31-2', '@F31-3', '@F31-4', '@F31-5',
  '@F53-1', '@F53-2', '@F53-3', '@F53-4', '@F53-5', '@F53-6', '@F53-7', '@F53-8', '@F53-9', '@F53-10', '@F53-11', '@F53-12', '@F53-13', '@F53-14', '@F53-15', '@F53-16', '@F53-17', '@F53-18', '@F53-19', '@F53-20', '@F53-21', '@F53-22', '@F53-23', '@F53-24',
  '@F52-1', '@F52-2', '@F52-3', '@F52-4', '@F52-5', '@F52-6', '@F52-7', '@F52-8', '@F52-9', '@F52-10', '@F52-11', '@F52-12', '@F52-13', '@F52-14', '@F52-15', '@F52-16',
  '@F35-1', '@F35-2', '@F35-3', '@F35-4', '@F35-5', '@F35-6', '@F35-7', '@F35-8', '@F35-9', '@F35-10', '@F35-11', '@F35-12', '@F35-13', '@F35-14', '@F35-15', '@F35-16', '@F35-17', '@F35-18',
  '@F36-1', '@F36-2', '@F36-3', '@F36-4', '@F36-5', '@F36-6', '@F36-7', '@F36-8',
  '@F31-6', '@F31-7', '@F31-8', '@F31-9', '@F31-10',
  '@F32-1', '@F32-2',
  '@F33-1', '@F33-2', '@F33-3',
  '@F34-1', '@F34-2', '@F34-3', '@F34-4', '@F34-5', '@F34-6', '@F34-7', '@F34-8', '@F34-9', '@F34-10', '@F34-11', '@F34-12', '@F34-13', '@F34-14', '@F34-15',
  '@F37-1', '@F37-2', '@F37-3', '@F37-4',
  '@F38-2', '@F38-3', '@F38-4', '@F38-5', '@F38-6', '@F38-7',
  '@F39-1', '@F39-2', '@F39-3', '@F39-4', '@F39-5', '@F39-6', '@F39-7',
  // F39 is already the current certificate-safety scenario. Migration uses
  // F40 so reconciling PR #205 cannot alias or replace that safety coverage.
  '@F40-1', '@F40-2', '@F40-4', '@F40-5',
  '@F40-7', '@F40-8', '@F40-9', '@F40-10', '@F40-11', '@F40-14', '@F40-15',
  // F45 Arc Spaces import, through the real Bring Your Tabs sheet.
  '@F45-1', '@F45-2', '@F45-3', '@F45-4', '@F45-5', '@F45-6', '@F45-7', '@F45-8',
  // F46 custom tab names.
  '@F46-1', '@F46-2', '@F46-3', '@F46-4', '@F46-5', '@F46-6', '@F46-7', '@F46-8', '@F46-9', '@F46-10',
  // F47 bangs.
  '@F47-1', '@F47-2', '@F47-3', '@F47-4', '@F47-5', '@F47-6', '@F47-7', '@F47-8', '@F47-9', '@F47-10', '@F47-11', '@F47-12', '@F47-13', '@F47-14', '@F47-15', '@F47-16', '@F47-17', '@F47-18',
  // F48 pinned homes.
  '@F48-1', '@F48-2', '@F48-3', '@F48-4', '@F48-5', '@F48-6', '@F48-7',
].join(' or ');

export default { ...common, tags: 'not @mobile' };
export const runnable = { ...common, tags: RUNNABLE, retry: 1 };
export const dry = { ...common, tags: RUNNABLE, dryRun: true };
