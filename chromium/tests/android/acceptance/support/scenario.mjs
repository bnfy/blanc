// Shared scenario moves for the step files.
export const host = name => (name.includes('.') ? name : `${name}.example`);
export const START_PAGE = /^chrome:\/\/blanc\/newtab\b/;

// Opens `name-1`…`name-N` and puts each in the group `name` with /group, the way a person does.
export async function makeGroup(world, name, count) {
  const titles = [];
  for (let i = 1; i <= count; i++) {
    await world.open(`${name}-${i}`);
    world.device.runInPalette(`/group ${name}`);
    titles.push(host(`${name}-${i}`));
  }
  return titles;
}
