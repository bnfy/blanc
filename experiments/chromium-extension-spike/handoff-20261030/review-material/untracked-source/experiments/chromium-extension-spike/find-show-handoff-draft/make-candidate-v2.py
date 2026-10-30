from pathlib import Path
import hashlib
p=Path(__file__).resolve().parent
wants={'groups':'853a2a9f700cae4084e3badaa4c463005a5b3159554fcf50ec78d48509cb7eaa','combined':'aa7f156244cac8266b6cd325cace5bf099a37682bf1ddac7a3a00fa965872140'}
for name,want in wants.items():
 source=p/f'host-{name}-candidate.js';raw=source.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=want:raise SystemExit('v1 changed: '+name)
 s=raw.decode()
 def change(old,new):
  global s
  if s.count(old)!=1:raise SystemExit('pattern mismatch: '+old[:45])
  s=s.replace(old,new,1)
 change('  const subscribers = new Map();\n','  const subscribers = new Map();\n  const overlayShowDocuments = new WeakMap();\n')
 change("  function subscribe(event, callback) {\n    if (!subscribers.has(event)) subscribers.set(event, new Set());\n    subscribers.get(event).add(callback);", """  function pruneOverlayShowSubscribers() {
    const current = overlay.contentDocument;
    const listeners = subscribers.get('onOverlayShow');
    for (const callback of listeners ?? []) {
      if (!current || overlayShowDocuments.get(callback) !== current) listeners.delete(callback);
    }
    return listeners;
  }

  function subscribe(event, callback) {
    if (!subscribers.has(event)) subscribers.set(event, new Set());
    if (event === 'onOverlayShow') {
      pruneOverlayShowSubscribers();
      overlayShowDocuments.set(callback, overlay.contentDocument);
    }
    subscribers.get(event).add(callback);""")
 change("  function emit(event, value) {\n    for (const callback", "  function emit(event, value) {\n    if (event === 'onOverlayShow') pruneOverlayShowSubscribers();\n    for (const callback")
 change("        !subscribers.get('onOverlayShow')?.size) return;", "        !pruneOverlayShowSubscribers()?.size) return;")
 change("  async function showExtensions() {\n", "  async function showExtensions() {\n    invalidateFindShow();\n")
 out=p/f'host-{name}-candidate-v2.js'
 if out.exists():raise SystemExit('v2 exists')
 out.write_text(s);print(name,hashlib.sha256(s.encode()).hexdigest())
