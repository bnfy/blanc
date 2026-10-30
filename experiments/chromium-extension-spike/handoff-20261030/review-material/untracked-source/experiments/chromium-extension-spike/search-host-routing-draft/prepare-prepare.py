from pathlib import Path
import hashlib,json
here=Path(__file__).resolve().parent
source=here.parent/'prepare.mjs'
s=source.read_text()
assert hashlib.sha256(source.read_bytes()).hexdigest()=='0f489a5f50e93c5817576a34ac53d6e820d87ff17e9c83234b02a0165909558d', 'prepare.mjs changed; review before regeneration'
def one(old,new):
 global s
 assert s.count(old)==1, (old[:100],s.count(old))
 s=s.replace(old,new,1)
anchor='''// Keep the reviewed compatibility script byte-for-byte in a Blanc-owned header.'''
modules='''// Search modules are embedded in the prototype translation unit. Copy exact
// source and headers to the matching relative include directory. This runs
// only when preparation is explicitly invoked for a selected checkout.
const blancSearchDir = path.join(chromium, 'chrome/browser/ui/modules');
fs.mkdirSync(blancSearchDir, { recursive: true });
for (const name of ['custom_template.h', 'custom_template.cc', 'selected_custom.h',
                    'selected_custom.cc', 'selected_shipping.h',
                    'selected_shipping.cc', 'selected_shipping_browser.cc']) {
  writeIfChanged(path.join(blancSearchDir, name),
    fs.readFileSync(path.join(here, 'native/modules', name), 'utf8'));
}

'''
one(anchor,modules+anchor)
anchor='''addPreviewNotice(assets, generated, actualVersion);'''
overlay='''// Exact reviewed hardened overlay, with a source identity guard so later
// shipping renderer changes cannot be silently replaced by an old copy.
const preparedOverlay = path.join(generated, 'overlay.js');
const preparedOverlayBase = assets.get(preparedOverlay);
if (!preparedOverlayBase || createHash('sha256').update(preparedOverlayBase).digest('hex') !== '3f2aa810d475515062e032ccc6b90af23a351c0d84f74c546d79aed5e742ee50')
  fail('shipping overlay changed; rebase and review search outcome changes');
const searchOverlay = fs.readFileSync(path.join(here, 'prototype/overlay-search.js'));
if (createHash('sha256').update(searchOverlay).digest('hex') !== '3fb033c9931a03b0f8dab9d33a12635962be7c2aaed2af5e85868ce79bbf4b31')
  fail('search overlay differs from reviewed candidate');
assets.set(preparedOverlay, searchOverlay);

'''
one(anchor,overlay+anchor)
anchor="""edit('chrome/browser/ui/webui/chrome_web_ui_configs.cc', ["""
deps='''// Search provider resolution is a direct dependency of the prototype's
// browser_view implementation. This separate idempotent edit handles both a
// clean base and a checkout already prepared by the previous prototype.
edit('chrome/browser/ui/views/frame/BUILD.gn', [{
  anchor: '  deps = [\\n    "//chrome/browser/bookmarks",\\n    "//chrome/browser/history",\\n',
  replacement: '  deps = [\\n    "//chrome/browser/bookmarks",\\n    "//chrome/browser/history",\\n    "//chrome/browser/search_engines",\\n',
  present: '  deps = [\\n    "//chrome/browser/bookmarks",\\n    "//chrome/browser/history",\\n    "//chrome/browser/search_engines",\\n',
}]);

'''
one(anchor,deps+anchor)
out=here/'prepare.candidate.mjs';out.write_text(s)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(here/'prepare-candidate-receipt.json').write_text(json.dumps({'source':sha(source),'candidate':sha(out),'modules':{p.name:sha(p) for p in sorted((here/'modules').iterdir()) if p.is_file()}},indent=2)+'\n')
print('Prepared isolated deterministic source-copy and GN dependency candidate; no checkout modified')
