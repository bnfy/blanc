import slashCommandCopy from "../../../copy/slash-commands.json" with { type: "json" };
import unreleased from "../data/unreleased-slash-commands.json" with { type: "json" };
// copy/slash-commands.json is the working tree's catalog and runs ahead of
// the public release. A command merged on main stays off the website until a
// release ships it (docs/marketing-claims.md): list it in
// unreleased-slash-commands.json, and test/unit/site-slash-commands.test.js
// keeps that list in step with the latest public release.
export const releasedSlashCommands = slashCommandCopy.commands.filter(
  ({ command }) => !Object.hasOwn(unreleased.commands, command),
);
