// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_TYPED_HTTPS_FALLBACK_H_
#define BLANC_BROWSER_UI_BROWSER_API_TYPED_HTTPS_FALLBACK_H_

#include <string_view>

namespace blanc::browser_api {

// Shipping's src/main/typed-https-fallback.js, in plain C++ so
// tools/typed-https-fallback.test.mjs can compile it with the system compiler.
//
// An https:// address loaded from the address bar (a bare domain the Island
// turned into https://, an address typed with https://, or a bang) is tried
// once over HTTP when HTTPS fails to connect or fails TLS. Some sites serve
// their bare domain only over HTTP, to redirect to www (keurig.com).
// Chromium's own HTTPS-Upgrades never sees these loads (it upgrades only
// http:// navigations), and in Chrome 158 it did not rescue such a site
// either.

// Whether an https:// address on `host` (GURL::host(): lowercase, IPv6 in
// brackets) may fall back. Never for IP addresses, localhost, single-label or
// local-only names, an address with a port, or one carrying a user name or
// password: the hosts HTTPS-Upgrades leaves alone.
bool MayFallBackToHttp(std::string_view host, bool has_port, bool has_credentials);

// Whether a failed HTTPS load's net error is one HTTP might not have: the
// server refused, reset, closed or timed out the connection, or its TLS or
// certificate failed. Never a name that doesn't resolve, no network, or a
// blocked or cancelled load.
bool IsHttpFallbackError(int net_error);

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_TYPED_HTTPS_FALLBACK_H_
