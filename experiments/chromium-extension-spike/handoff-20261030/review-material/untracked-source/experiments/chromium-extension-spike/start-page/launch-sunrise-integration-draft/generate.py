from pathlib import Path
import hashlib, json

h=Path(__file__).resolve().parent
inputs=json.loads((h/'base-inputs.json').read_text())
for name,item in inputs.items():
    assert hashlib.sha256((h/name).read_bytes()).hexdigest()==item['sha256'], name
def replace(s,old,new):
    assert s.count(old)==1, old[:100]
    return s.replace(old,new,1)
ui=(h/'ui-restored-base.cc').read_text()
ui=replace(ui,'#include "base/command_line.h"','#include "base/command_line.h"\n#include "base/process/process.h"\n#include "base/path_service.h"\n#include "chrome/browser/browser_process.h"\n#include "chrome/common/chrome_constants.h"\n#include "chrome/common/chrome_paths.h"')
ui=replace(ui,'class NewTabHandler : public content::WebUIMessageHandler,','#include "chrome/browser/ui/launch_sunrise_integration.inc"\n\nclass NewTabHandler : public content::WebUIMessageHandler,')
ui=replace(ui,'    auto* profile = Profile::FromWebUI(web_ui());\n    if (method == "installedTheme"', '    auto* profile = Profile::FromWebUI(web_ui());\n    if (method == "launchSunriseClaim" && args.empty()) {\n      Reply(id, true, base::Value(ClaimSunriseForTrustedStart(contents, profile)));\n      return;\n    }\n    if (method == "installedTheme"')
ui=replace(ui,'      "blocking-settings.html", "blocking-settings.js", "blocking-settings-adapter.js",','      "blocking-settings.html", "blocking-settings.js", "blocking-settings-adapter.js",\n      "settings-home.html", "appearance-settings.html", "appearance-settings.js",')
ui=replace(ui,'          url != GURL("chrome://blanc-prototype/blocking-settings.html") &&','          url != GURL("chrome://blanc-prototype/blocking-settings.html") &&\n          url != GURL("chrome://blanc-prototype/settings-home.html") &&\n          url != GURL("chrome://blanc-prototype/appearance-settings.html") &&')
ui=replace(ui,'  web_ui->AddMessageHandler(std::make_unique<BlockingSettingsHandler>());','  web_ui->AddMessageHandler(std::make_unique<BlockingSettingsHandler>());\n  web_ui->AddMessageHandler(std::make_unique<SunriseSettingsHandler>());')
(h/'ui-candidate.cc').write_text(ui)
prefs=(h/'prefs-base.cc').read_text()
prefs=replace(prefs,'void RegisterLocalState(PrefRegistrySimple* registry) {','void RegisterLocalState(PrefRegistrySimple* registry) {\n#if __has_include("chrome/browser/ui/blanc_prototype_ui.h")\n  registry->RegisterBooleanPref("blanc.prototype.launch_sunrise", false);\n#endif')
(h/'prefs-candidate.cc').write_text(prefs)
adapter=(h/'adapter-base.js').read_text()
adapter=replace(adapter,'      data: async () => {\n        const results = await Promise.allSettled(', '      data: async () => {\n        // Claim synchronously when the first data request starts. The browser\n        // enforces the lifetime/visibility policy; a failed claim is off.\n        const sunrise = request("launchSunriseClaim").catch(() => false);\n        const results = await Promise.allSettled(')
adapter=replace(adapter,'          topSites, wallpaperVisible: !document.hidden };','          topSites, wallpaperVisible: !document.hidden, launchSunrise: (await sunrise) === true };')
(h/'adapter-candidate.js').write_text(adapter)
host=(h/'host-base.js').read_text()
host=replace(host,"      if (name === 'settings' && section === 'blocking') {", "      if (name === 'settings' && section === 'appearance') {\n        await request('createTab', ['chrome://blanc-prototype/appearance-settings.html']);\n        await close(); await refresh(); return;\n      }\n      if (name === 'settings' && section === 'blocking') {")
host=replace(host,"await request('createTab', ['chrome://settings/']);\n        await close(); await refresh(); return;", "await request('createTab', ['chrome://blanc-prototype/settings-home.html']);\n        await close(); await refresh(); return;")
(h/'host-candidate.js').write_text(host)
print('Prepared isolated source, local-state registration, adapter and route candidates')
