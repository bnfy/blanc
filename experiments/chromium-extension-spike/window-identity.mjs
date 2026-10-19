export function prepareWindowIdentity(edit) {
  edit("chrome/browser/sessions/session_service_base.cc", [
  {
    "anchor": "#include \"chrome/browser/sessions/session_service_base.h\"\n",
    "replacement": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/sessions/session_service_base.h\"\n",
    "present": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/sessions/session_service_base.h\"\n"
  },
  {
    "anchor": "\n  command_storage_manager()->AppendRebuildCommand(\n      sessions::CreateSetWindowBoundsCommand(\n",
    "replacement": "  const auto identity = blanc_prototype::WindowIdentity(browser);\n  if (!identity.empty()) {\n    command_storage_manager()->AppendRebuildCommand(\n        sessions::CreateAddWindowExtraDataCommand(browser->GetSessionID(),\n            blanc_prototype::kWindowIdentityKey, identity));\n  }\n\n  command_storage_manager()->AppendRebuildCommand(\n      sessions::CreateSetWindowBoundsCommand(\n",
    "present": "  const auto identity = blanc_prototype::WindowIdentity(browser);\n  if (!identity.empty()) {\n    command_storage_manager()->AppendRebuildCommand(\n        sessions::CreateAddWindowExtraDataCommand(browser->GetSessionID(),\n            blanc_prototype::kWindowIdentityKey, identity));\n  }\n\n  command_storage_manager()->AppendRebuildCommand(\n      sessions::CreateSetWindowBoundsCommand(\n"
  }
]);
  edit("chrome/browser/sessions/session_restore.cc", [
  {
    "anchor": "#include \"chrome/browser/sessions/session_restore.h\"\n",
    "replacement": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/sessions/session_restore.h\"\n",
    "present": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/sessions/session_restore.h\"\n"
  },
  {
    "anchor": "    if (auto* manager =\n",
    "replacement": "    blanc_prototype::RestoreWindowIdentity(browser_window, extra_data);\n    if (auto* manager =\n",
    "present": "    blanc_prototype::RestoreWindowIdentity(browser_window, extra_data);\n    if (auto* manager =\n"
  }
]);
  edit("chrome/browser/ui/browser_live_tab_context.cc", [
  {
    "anchor": "#include \"chrome/browser/ui/browser_live_tab_context.h\"\n",
    "replacement": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/ui/browser_live_tab_context.h\"\n",
    "present": "#include \"chrome/browser/ui/blanc_prototype_ui.h\"\n#include \"chrome/browser/ui/browser_live_tab_context.h\"\n"
  },
  {
    "anchor": "\n  auto* controller =\n",
    "replacement": "  const auto identity = blanc_prototype::WindowIdentity(&browser_.get());\n  if (!identity.empty()) data[blanc_prototype::kWindowIdentityKey] = identity;\n\n  auto* controller =\n",
    "present": "  const auto identity = blanc_prototype::WindowIdentity(&browser_.get());\n  if (!identity.empty()) data[blanc_prototype::kWindowIdentityKey] = identity;\n\n  auto* controller =\n"
  },
  {
    "anchor": "\n  return BrowserLiveTabContext::From(browser);\n",
    "replacement": "  blanc_prototype::RestoreWindowIdentity(browser, extra_data);\n\n  return BrowserLiveTabContext::From(browser);\n",
    "present": "  blanc_prototype::RestoreWindowIdentity(browser, extra_data);\n\n  return BrowserLiveTabContext::From(browser);\n"
  }
]);
}
