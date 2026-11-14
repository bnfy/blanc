import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./prototype/installed-theme.js', import.meta.url), 'utf8');
function fixture() {
  const nodes = new Map(), props = new Map(), attrs = new Map();
  const element = () => ({ style: {}, remove() { nodes.delete(this.id); } });
  const doc = { documentElement: { style: { setProperty: (k,v) => props.set(k,v), removeProperty: k => props.delete(k) },
    toggleAttribute: (k,v) => attrs.set(k,v) }, createElement: element, getElementById: id => nodes.get(id),
    head: { append: e => nodes.set(e.id,e) }, body: { style: { setProperty() {}, removeProperty() {} }, append: e => nodes.set(e.id,e), prepend: e => nodes.set(e.id,e) } };
  const context = { window: {} }; vm.runInNewContext(source, context);
  return { apply: theme => context.window.BlancInstalledTheme.apply(doc, theme, true), props, attrs, nodes };
}
const theme = { id:'fixture', surface:'#dd9999', text:'#222222', background:'#ffccee', backgroundText:'#111111', link:'#444444', image:'data:image/png;base64,aGVsbG8=', position:'right bottom', repeat:'repeat-x' };
test('color-only themes apply their NTP palette', () => {
  const f=fixture(); f.apply(theme); assert.equal(f.props.get('--bg'),theme.background);
  assert.equal(f.props.get('--text'), theme.backgroundText);
});
test('Undo/removal restores CSS inheritance', () => {
  const f=fixture(); f.apply(theme); f.apply({}); assert.equal(f.props.size,0);
  assert.equal(f.attrs.get('data-store-theme'),false);
});
test('invalid theme colors are refused', () => {
  const f=fixture(); f.apply({...theme,surface:'url(https://example.invalid)'});
  assert.equal(f.attrs.get('data-store-theme'),false); assert.equal(f.props.size,0);
});
test('toolbar artwork is scoped to the native theme endpoint and cleared on removal', () => {
 const f=fixture();const toolbarImage='chrome://blanc-prototype/theme-toolbar.png?'+'a'.repeat(32);
 f.apply({...theme,toolbarImage,toolbarImageText:'#ffffff'});
 assert.equal(f.attrs.get('data-store-toolbar'),true);
 assert.equal(f.props.get('--theme-toolbar-image'),`url("${toolbarImage}")`);
 f.apply({...theme,toolbarImage:'https://example.invalid/image.png'});
 assert.equal(f.attrs.get('data-store-toolbar'),false);
 assert.equal(f.props.has('--theme-toolbar-image'),false);
 f.apply({});assert.equal(f.props.size,0);
});
