import slashCommandCopy from "../../../copy/slash-commands.json" with { type: "json" };
import unreleased from "../data/unreleased-slash-commands.json" with { type: "json" };
import messages from "../../../copy/messages/en.json" with { type: "json" };
// copy/slash-commands.json is the working tree's catalog and runs ahead of
// the public release. A command merged on main stays off the website until a
// release ships it (docs/marketing-claims.md): list it in
// unreleased-slash-commands.json, and test/unit/site-slash-commands.test.js
// keeps that list in step with the latest public release.
//
// Since F44 the registry holds no text: each command's hint, and the longer
// description its reference spelling (doc.command) takes, live in the
// interface catalog as slash.<name>.hint and slash.<name>.doc, as overlay.js
// and pages/shortcuts.js read them.
const catalogText = (command, kind) => {
  const name = command.slice(1).replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
  const entry = messages[`slash.${name}.${kind}`];
  if (!entry) throw new Error(`copy/messages/en.json has no slash.${name}.${kind} for ${command}`);
  return entry.message;
};

export const releasedSlashCommands = slashCommandCopy.commands
  .filter(({ command }) => !Object.hasOwn(unreleased.commands, command))
  .map((entry) => ({
    ...entry,
    hint: catalogText(entry.command, 'hint'),
    ...(entry.doc && { doc: { ...entry.doc, hint: catalogText(entry.command, 'doc') } }),
  }));
