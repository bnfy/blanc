// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/page_handoff.h"

#include "base/command_line.h"
#include "base/no_destructor.h"
#include "blanc/browser/ui/browser_api/external_handoff.h"
#include "url/gurl.h"

namespace blanc::browser_api {

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
std::vector<std::pair<std::string, std::string>>& TestExternalLaunches() {
  static base::NoDestructor<std::vector<std::pair<std::string, std::string>>> launches;
  return *launches;
}
#endif

bool HandlePageExternalProtocol(const GURL& url) {
  // Untrusted: the deny list doesn't depend on who started the launch.
  const bool deny = ClassifyExternalNavigation(url.spec(), /*trusted=*/false) == Handoff::kDeny;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test")) {
    TestExternalLaunches().emplace_back(url.spec(), deny ? "deny" : "prompt");
    return true;
  }
#endif
  return deny;
}

}  // namespace blanc::browser_api
