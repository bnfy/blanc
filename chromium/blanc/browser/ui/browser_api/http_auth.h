// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_HTTP_AUTH_H_
#define BLANC_BROWSER_UI_BROWSER_API_HTTP_AUTH_H_

#include <string>
#include <vector>

#include "blanc/buildflags.h"

class GURL;
namespace net { class AuthChallengeInfo; }

namespace blanc::browser_api {

// Shipping v1.45.1's HTTP authentication policy (F20; owner, 2026-11-03):
// website sign-in belongs to the website, so an HTTP basic or digest
// challenge, from a navigation, a page's resource or a proxy, never becomes a
// credential dialog. In an Island window ChromeContentBrowserClient::
// CreateLoginDelegate (patch 0014) asks this and returns no delegate, which
// cancels the challenge: the 401 or 407 reaches the page like any response.
bool RefuseHttpAuth(const net::AuthChallengeInfo& challenge, const GURL& url, bool navigation);

#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)
// Under --blanc-test each refused challenge is recorded (shipping's login
// event probe).
struct AuthChallenge {
  std::string url;
  bool navigation = false;
  bool proxy = false;
  std::string scheme;
  std::string realm;
};
std::vector<AuthChallenge>& TestAuthChallenges();
#endif

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_HTTP_AUTH_H_
