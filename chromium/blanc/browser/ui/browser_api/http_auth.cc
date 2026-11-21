// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/http_auth.h"

#include "base/command_line.h"
#include "base/no_destructor.h"
#include "blanc/common/island_mode.h"
#include "net/base/auth.h"
#include "url/gurl.h"

namespace blanc::browser_api {

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
std::vector<AuthChallenge>& TestAuthChallenges() {
  static base::NoDestructor<std::vector<AuthChallenge>> challenges;
  return *challenges;
}
#endif

bool RefuseHttpAuth(const net::AuthChallengeInfo& challenge, const GURL& url, bool navigation) {
  if (!IslandMode()) return false;
#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("blanc-test") &&
      TestAuthChallenges().size() < 256) {
    TestAuthChallenges().push_back({url.spec(), navigation, challenge.is_proxy,
                                    challenge.scheme, challenge.realm});
  }
#endif
  return true;
}

}  // namespace blanc::browser_api
