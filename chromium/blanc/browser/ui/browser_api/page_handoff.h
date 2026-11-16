// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_PAGE_HANDOFF_H_
#define BLANC_BROWSER_UI_BROWSER_API_PAGE_HANDOFF_H_

#include <string>
#include <utility>
#include <vector>

#include "blanc/buildflags.h"

class GURL;

namespace blanc::browser_api {

// Blanc's rule ahead of Chromium's external-protocol handler
// (ChromeContentBrowserClient::HandleExternalProtocol, patch 0006). True when
// Blanc consumed the launch, which Chromium then cancels silently: a scheme on
// shipping v1.45.1's deny list (system-command, installer, settings and
// network-file handlers, external_handoff.cc) never reaches the OS, from a
// page or from the address bar. Anything else falls through to Chromium's
// prompt (V9).
bool HandlePageExternalProtocol(const GURL& url);

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
// Under --blanc-test every external launch is recorded as {url, "deny" or
// "prompt"} and consumed, so a test run never opens an app or a dialog.
std::vector<std::pair<std::string, std::string>>& TestExternalLaunches();
#endif

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_PAGE_HANDOFF_H_
