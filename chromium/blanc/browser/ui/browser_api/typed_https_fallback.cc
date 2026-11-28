// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/browser_api/typed_https_fallback.h"

namespace blanc::browser_api {
namespace {

bool EndsWith(std::string_view s, std::string_view suffix) {
  return s.size() >= suffix.size() && s.substr(s.size() - suffix.size()) == suffix;
}

bool IsDottedQuad(std::string_view host) {
  int parts = 0;
  size_t digits = 0;
  for (char c : host) {
    if (c >= '0' && c <= '9') {
      if (++digits > 3) return false;
    } else if (c == '.' && digits > 0) {
      ++parts;
      digits = 0;
    } else {
      return false;
    }
  }
  return digits > 0 && parts == 3;
}

}  // namespace

bool MayFallBackToHttp(std::string_view host, bool has_port, bool has_credentials) {
  if (has_port || has_credentials) return false;
  if (!host.empty() && host.back() == '.') host.remove_suffix(1);
  if (host.empty() || host.front() == '[' || host.find('.') == std::string_view::npos) return false;
  if (IsDottedQuad(host)) return false;
  for (std::string_view suffix : {".local", ".localhost", ".test", ".internal", ".home.arpa", ".lan",
                                  ".example", ".invalid", ".onion"}) {
    if (EndsWith(host, suffix)) return false;
  }
  return true;
}

bool IsHttpFallbackError(int net_error) {
  switch (net_error) {
    case -7:    // TIMED_OUT
    case -15:   // SOCKET_NOT_CONNECTED
    case -100:  // CONNECTION_CLOSED
    case -101:  // CONNECTION_RESET
    case -102:  // CONNECTION_REFUSED
    case -103:  // CONNECTION_ABORTED
    case -104:  // CONNECTION_FAILED
    case -107:  // SSL_PROTOCOL_ERROR
    case -109:  // ADDRESS_UNREACHABLE
    case -113:  // SSL_VERSION_OR_CIPHER_MISMATCH
    case -118:  // CONNECTION_TIMED_OUT
    case -324:  // EMPTY_RESPONSE
      return true;
    default:
      return net_error <= -200 && net_error >= -299;  // certificate errors
  }
}

}  // namespace blanc::browser_api
