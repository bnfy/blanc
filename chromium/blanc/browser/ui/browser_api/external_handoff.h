// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_EXTERNAL_HANDOFF_H_
#define BLANC_BROWSER_UI_BROWSER_API_EXTERNAL_HANDOFF_H_

#include <string_view>

namespace blanc::browser_api {

// Shipping v1.45.1's classifyExternalNavigation (src/main/external-protocols.js),
// in plain C++ so tools/external-handoff.test.mjs can compile it and compare it
// with shipping's own code. kOpen hands off without a prompt; kConfirm goes
// through Chromium's external-protocol prompt (V9); kDeny is an OS-control
// scheme; kNone is not a hand-off.
enum class Handoff { kNone, kOpen, kConfirm, kDeny };
Handoff ClassifyExternalNavigation(std::string_view url, bool trusted);

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_EXTERNAL_HANDOFF_H_
