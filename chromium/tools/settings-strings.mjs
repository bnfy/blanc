#!/usr/bin/env node
// The strings Blanc's own controls in chrome://settings show (S1.7):
// loadTimeData names the settings pages read with $i18n{} and
// loadTimeData.getString(), generated from shipping's published catalogs
// for each selectable language, as menu-strings.mjs does for the menus.
//   node chromium/tools/settings-strings.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogs} from './menu-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const header = path.join(root, 'blanc/common/settings_strings.h');
const {ref, commit} = JSON.parse(fs.readFileSync(path.join(root, 'blanc/island-renderer.json'), 'utf8'));
// loadTimeData name, shipping message key.
export const STRINGS = [
  ['blancIslandHoverOpen', 'settings.general.islandHoverOpen.label'],
  ['blancIslandHoverOpenHint', 'settings.general.islandHoverOpen.hint'],
  ['blancIslandAutoHide', 'settings.general.islandAutoHide.label'],
  ['blancIslandAutoHideHint', 'settings.general.islandAutoHide.hint'],
  ['blancIslandAutoHideStyle', 'settings.general.islandAutoHideStyle.label'],
  ['blancIslandAutoHideStyleHint', 'settings.general.islandAutoHideStyle.hint'],
  ['blancIslandAutoHideStyleFloat', 'settings.general.islandAutoHideStyle.float'],
  ['blancIslandAutoHideStylePush', 'settings.general.islandAutoHideStyle.push'],
  ['blancIslandSize', 'settings.general.islandSize.label'],
  ['blancIslandSizeHint', 'settings.general.islandSize.hint'],
  ['blancIslandSizeDefault', 'settings.general.islandSize.default'],
  ['blancIslandSizeLarge', 'settings.general.islandSize.large'],
  ['blancIslandSizeExtraLarge', 'settings.general.islandSize.extraLarge'],
  ['blancIslandSiteColors', 'settings.general.islandSiteColors.label'],
  ['blancIslandSiteColorsHint', 'settings.general.islandSiteColors.hint'],
  ['blancIslandTabIcons', 'settings.general.islandTabIcons.label'],
  ['blancIslandTabIconsHint', 'settings.general.islandTabIcons.hint'],
  ['blancProfiles', 'settings.profiles.title'],
  ['blancImportBar', 'import.folder.bookmarksBar'],
  ['blancImportOther', 'import.folder.other'],
  ['blancImportMobile', 'import.folder.mobile'],
  ['blancImportPermission', 'import.permissionGuidance'],
  ['blancSurfaceStyle', 'settings.general.surfaceStyle.label'],
  ['blancSurfaceStyleHint', 'settings.general.surfaceStyle.hint'],
  ['blancSurfaceStyleSunrise', 'settings.general.surfaceStyle.sunrise'],
  ['blancSurfaceStyleNeutral', 'settings.general.surfaceStyle.neutral'],
  ['blancSearchPriorityResults', 'settings.general.searchPriorityResults.label'],
  ['blancSearchPriorityResultsHint', 'settings.general.searchPriorityResults.hint'],
  ['blancSearchSuggestions', 'settings.general.searchSuggestions.label'],
  ['blancSearchSuggestionsHint', 'settings.general.searchSuggestions.hint'],
  ['blancBangs', 'settings.general.bangs.label'],
  ['blancBangsHint', 'settings.general.bangs.hint'],
  ['blancBlocking', 'settings.privacy.adblockEnabled.label'],
  ['blancBlockingHint', 'settings.privacy.adblockEnabled.hint'],
  // Lists and the language, through the native handler.
  ['blancCustomBangs', 'settings.general.customBangs.label'],
  ['blancCustomBangsHint', 'settings.general.customBangs.hint'],
  ['blancCustomBangsCode', 'settings.general.customBangs.code'],
  ['blancCustomBangsName', 'settings.general.customBangs.name'],
  ['blancCustomBangsAddress', 'settings.general.customBangs.address'],
  ['blancCustomBangsAdd', 'settings.general.customBangs.add'],
  ['blancCustomBangsEmpty', 'settings.general.customBangs.empty'],
  ['blancCustomBangsReplaces', 'settings.general.customBangs.replaces'],
  ['blancCustomBangsDuplicate', 'settings.general.customBangs.duplicate'],
  ['blancCustomBangsError', 'settings.general.customBangsError'],
  ['blancCustomBangsRemove', 'settings.general.customBangs.remove'],
  ['blancBlockingStatusReady', 'settings.blockingStatus.ready'],
  ['blancBlockingStatusInitializing', 'settings.blockingStatus.initializing'],
  ['blancBlockingStatusDisabled', 'settings.blockingStatus.disabled'],
  ['blancBlockingStatusFailed', 'settings.blockingStatus.failed'],
  ['blancCallAudio', 'settings.privacy.webrtcAudioBuffer.label'],
  ['blancCallAudioHint', 'settings.privacy.webrtcAudioBuffer.hint'],
  ['blancCallAudioAutomatic', 'settings.privacy.webrtcAudioBuffer.automatic'],
  ['blancCallAudioStable', 'settings.privacy.webrtcAudioBuffer.stable'],
  ['blancCallAudioResilient', 'settings.privacy.webrtcAudioBuffer.resilient'],
  ['blancExceptions', 'settings.privacy.sitesListedHereLoad'],
  ['blancExceptionsAdd', 'settings.privacy.exceptionAdd'],
  ['blancExceptionsEmpty', 'settings.privacy.exceptionList.empty'],
  ['blancExceptionsRemove', 'settings.siteList.remove'],
  ['blancLanguage', 'settings.language.label'],
  ['blancLanguageHint', 'settings.language.hint'],
  ['blancLanguageSystem', 'settings.language.system'],
  ['blancLanguageRelaunch', 'settings.language.relaunch'],
];

export function generate(rows = catalogs(STRINGS)) {
  const id = code => code.replace('-', '_');
  const fallback = rows.filter(({code}) => code !== 'en').map(({code}) =>
    `  if (primary == "${code.split('-')[0]}") return kStrings_${id(code)};`).join('\n');
  return `// Generated by chromium/tools/settings-strings.mjs from shipping ${ref}
// (${commit}); do not edit.
#ifndef BLANC_COMMON_SETTINGS_STRINGS_H_
#define BLANC_COMMON_SETTINGS_STRINGS_H_

#include <array>
#include <span>
#include <string>
#include <string_view>

namespace blanc::settings {

struct String {
  std::string_view name;
  std::u16string_view value;
};
${rows.map(({code, values}) => `inline constexpr std::array<String, ${STRINGS.length}> kStrings_${id(code)} = {{
${STRINGS.map(([name], i) => `    {"${name}", u${JSON.stringify(values[i])}},`).join('\n')}
}};`).join('\n')}

// Chromium's application locale chooses, as for the settings page around
// these strings; a region falls back to its language and anything else to
// English, as shipping's resolveLocale does.
inline std::span<const String> ForLocale(std::string locale) {
  for (char& c : locale) c = c == '_' ? '-' : (c >= 'A' && c <= 'Z') ? static_cast<char>(c + 32) : c;
  const std::string primary = locale.substr(0, locale.find('-'));
${fallback}
  return kStrings_en;
}

}  // namespace blanc::settings

#endif  // BLANC_COMMON_SETTINGS_STRINGS_H_
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(header, text);
    console.log(`Wrote ${path.relative(root, header)} from ${ref}`);
  } else if (process.argv.includes('--check')) {
    if (!fs.existsSync(header) || fs.readFileSync(header, 'utf8') !== text)
      throw Error(`${path.relative(root, header)} differs from ${ref}; run --write`);
    console.log(`Settings strings match ${ref}`);
  } else {
    throw Error('Usage: settings-strings.mjs --write | --check');
  }
}
