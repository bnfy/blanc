// Research hooks are excluded by default without changing GN/toolchain flags.
import fs from 'node:fs';
import path from 'node:path';
import { writeIfChanged } from './native/blocker/write-file.mjs';
export function writeResearchPolicy(src, enabled = false) {
  writeIfChanged(path.join(src, 'content/public/common/blanc_research_build.h'),
    '#ifndef CONTENT_PUBLIC_COMMON_BLANC_RESEARCH_BUILD_H_\n#define CONTENT_PUBLIC_COMMON_BLANC_RESEARCH_BUILD_H_\n' +
    `#define BLANC_RESEARCH_HOOKS ${enabled ? 1 : 0}\n#endif\n`);
}
export function guardResearchHooks(src) {
  const header = '#include "content/public/common/blanc_research_build.h"';
  function guard(relative, begin, end, fallback = '') {
    const file = path.join(src, relative);
    if (!fs.existsSync(file)) throw Error('Research source missing: ' + relative);
    let text = fs.readFileSync(file, 'utf8');
    if (!text.includes(header)) text = text.replace(/(#include [^\n]+\n)/, '$1' + header + '\n');
    const marker = '#if BLANC_RESEARCH_HOOKS\n' + begin;
    if (!text.includes(marker)) {
      const start = text.indexOf(begin), finish = text.indexOf(end, start);
      if (start < 0 || finish < 0) throw Error('Research guard anchor changed: ' + relative);
      text = text.slice(0, start) + '#if BLANC_RESEARCH_HOOKS\n' + text.slice(start, finish) + (fallback ? '#else\n' + fallback : '') + '#endif\n' + text.slice(finish);
    }
    writeIfChanged(file, text);
  }
  guard('chrome/browser/extensions/component_extensions_allowlist/allowlist.cc',
    '  // Blanc offline component admission probe;', '  constexpr auto kAllowed');
  guard('chrome/browser/extensions/component_loader.cc',
    '  // Blanc admission-only probe:', '  const base::CommandLine* command_line =');
  guard('extensions/browser/script_executor.cc',
    '  // Blanc diagnostic fault injection:', '  // Handler handles IPCs and deletes itself on completion.');
  guard('extensions/browser/api/execute_code_function.cc',
    '  // Blanc: Execute runs after asynchronous file loading.',
    '  mojom::MatchOriginAsFallbackBehavior match_about_blank =',
    '  if (details_->blanc_document_id.has_value()) {\n    *error = "Research document targets are unavailable in this build.";\n    return false;\n  }\n\n');
  guard('chrome/browser/chrome_content_browser_client_receiver_bindings.cc',
    '  map->Add<blanc::mojom::DocumentStart>', '  chrome::internal::PopulateChromeFrameBinders');
  guard('chrome/browser/chrome_content_browser_client.cc',
    '        "blanc-ubo-document-start",', '        autofill::switches::kIgnoreAutocompleteOffForAutofill,');
}
