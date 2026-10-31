#include <cassert>
#include "scope.h"
using namespace blanc::downloads_projection;
int main() {
  ScopeEvidence valid{true,true,true,true,true,true,true,true};
  assert(CheckScope(static_cast<Scope>(99),valid)==ScopeDecision::kDenied);
  assert(ValidDisplayName(u"report.pdf"));
  assert(!ValidDisplayName(u"")); assert(!ValidDisplayName(u".")); assert(!ValidDisplayName(u".."));
  assert(!ValidDisplayName(u"C:secret")); assert(!ValidDisplayName(u"x:foo"));
  assert(!ValidDisplayName(u"one/two")); assert(!ValidDisplayName(u"one\\two"));
  assert(!ValidDisplayName(u"one\nname")); assert(!ValidDisplayName(u"one\x7fname"));
  assert(CheckScope(Scope::kRegular, valid)==ScopeDecision::kReady);
  assert(CheckScope(Scope::kPrimaryPrivate, valid)==ScopeDecision::kReady);
  auto check_denied=[&](ScopeEvidence e){assert(CheckScope(Scope::kRegular,e)==ScopeDecision::kDenied);assert(CheckScope(Scope::kPrimaryPrivate,e)==ScopeDecision::kDenied);};
  auto x=valid;x.regular_owner=false;check_denied(x);
  x=valid;x.current_epoch_nonempty=false;check_denied(x);
  x=valid;x.epoch_matches=false;check_denied(x);
  x=valid;x.current_context_exists=false;check_denied(x);
  x=valid;x.context_is_expected_kind=false;check_denied(x);
  x=valid;x.manager_matches_context=false;check_denied(x);
  x=valid;x.manager_initialized=false;assert(CheckScope(Scope::kRegular,x)==ScopeDecision::kPending);assert(CheckScope(Scope::kPrimaryPrivate,x)==ScopeDecision::kPending);
  x=valid;x.regular_history_ready=false;assert(CheckScope(Scope::kRegular,x)==ScopeDecision::kPending);assert(CheckScope(Scope::kPrimaryPrivate,x)==ScopeDecision::kReady);
}
