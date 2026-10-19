import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Reproduce the 157 regression: a separator patch already contains HasIsland,
// but the independent header-space patch has not yet been applied.
test('separator customization cannot suppress the 68px header reservation', () => {
  const source = fs.readFileSync(new URL('./prepare.mjs', import.meta.url), 'utf8');
  const begin = source.indexOf("edit('chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc', [");
  const end = source.indexOf('// The Island owns fullscreen', begin);
  assert(begin >= 0 && end > begin);
  let edits;
  vm.runInNewContext(source.slice(begin, end), { edit: (_path, value) => { edits = value; } });
  const patch = edits.find(edit => edit.anchor.includes('const int original_top'));
  assert(patch);
  let fixture = 'if (blanc_prototype::HasIsland(views().browser_view)) {\n  info.top_container_separator = false;\n}\n' + patch.anchor;
  const apply = () => {
    if (!fixture.includes(patch.present)) {
      assert.equal(fixture.split(patch.anchor).length, 2);
      fixture = fixture.replace(patch.anchor, patch.replacement);
    }
  };
  apply();
  assert(fixture.includes('params.visual_client_area.width(), 68)'));
  const once = fixture;
  apply();
  assert.equal(fixture, once);
  assert.equal(fixture.split('for (views::View* child').length, 2);
});
