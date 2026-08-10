// Driving the command palette the way a person does.
//
// The Gherkin says "I run the slash command X" and stays platform-neutral —
// on mobile that gesture is something else entirely. This binding is where
// "run a slash command" means what it means on desktop: open the panel, type
// the command, press Enter.
//
// Steps used to switch on the command name and call the main-process function
// behind it instead. That proves the action works while proving nothing about
// the command: not that it is in the list, not that Enter picks it, not that
// its per-command flags behave, not that it parses its own argument out of the
// typed text. /sleep quieted tabs and showed the user nothing for exactly that
// reason, and every check passed.
const ctx = require('./context');
const { openOverlaySurface } = require('./poll');

async function overlayPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const page = ctx.app.windows().find((candidate) =>
      !candidate.isClosed() && candidate.url().endsWith('/src/renderer/overlay.html'));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('overlay window never appeared');
}

/**
 * Type a slash command into the open command palette and submit it.
 * Opens the palette first when it is not already showing, so scenarios keep
 * reading as behaviour rather than as UI choreography.
 */
async function runSlashCommand(world, command) {
  // main's overlayMode flips before the renderer has painted the panel, so
  // waiting on it races the input into existence. openOverlaySurface waits on
  // the RENDERER's mode, which is the state the fill actually needs.
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await overlayPage();
  await page.fill('#addressInput', command);
  await page.press('#addressInput', 'Enter');
}

module.exports = { overlayPage, runSlashCommand };
