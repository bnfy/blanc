#include "fresh_default_policy.h"
#include <cassert>
#include <iostream>
using blanc::fresh_default::Decision;
using blanc::fresh_default::Decide;
using blanc::fresh_default::Facts;
using blanc::fresh_default::CandidateMatches;
int main() {
  Facts ready{true,true,true,true,true,true,true,true,true,true,true};
  assert(Decide(ready)==Decision::kSelectDuckDuckGo);
  auto waiting=ready;waiting.service_loaded=false;
  assert(Decide(waiting)==Decision::kAwaitModel);
  auto identity=ready;identity.tokens_loaded=false;
  assert(Decide(identity)==Decision::kAwaitIdentity);
  bool Facts::* protections[]={&Facts::regular,&Facts::genuinely_new_store,
    &Facts::untouched_default_pref,&Facts::no_provider_overrides,&Facts::no_accounts,
    &Facts::choice_known_outside_scope,&Facts::effective_fallback,
    &Facts::exact_unique_builtin_ddg,&Facts::candidate_allowed};
  int checks=3;
  for(auto field:protections){auto blocked=ready;blocked.*field=false;
    assert(Decide(blocked)==Decision::kPreserve);++checks;
    if(field!=&Facts::effective_fallback && field!=&Facts::exact_unique_builtin_ddg && field!=&Facts::candidate_allowed){
      blocked.service_loaded=false;assert(Decide(blocked)==Decision::kPreserve);++checks;
    }
  }
  // User/policy/extension selection occurring while the model loads wins.
  auto after=waiting;after.service_loaded=true;after.effective_fallback=false;
  assert(Decide(after)==Decision::kPreserve);++checks;
  after=waiting;after.service_loaded=true;after.untouched_default_pref=false;
  assert(Decide(after)==Decision::kPreserve);++checks;
  after=waiting;after.service_loaded=true;after.no_provider_overrides=false;
  assert(Decide(after)==Decision::kPreserve);++checks;
  auto account_arrived=identity;account_arrived.tokens_loaded=true;account_arrived.no_accounts=false;
  assert(Decide(account_arrived)==Decision::kPreserve);++checks;
  auto chose_during_identity=identity;chose_during_identity.untouched_default_pref=false;
  assert(Decide(chose_during_identity)==Decision::kPreserve);++checks;
  auto signed_out=identity;signed_out.tokens_loaded=true;
  assert(Decide(signed_out)==Decision::kSelectDuckDuckGo);++checks;
  CandidateMatches candidates;
  assert(!candidates.IsUnique());++checks;
  candidates.Add(false,false);assert(!candidates.IsUnique());++checks;
  candidates.Add(true,true);assert(candidates.IsUnique());++checks;
  candidates.Add(true,false);assert(!candidates.IsUnique());++checks;
  CandidateMatches modified;modified.Add(true,false);assert(!modified.IsUnique());++checks;
  CandidateMatches duplicate;duplicate.Add(true,true);duplicate.Add(true,true);assert(!duplicate.IsUnique());++checks;
  std::cout<<"fresh-default policy checks="<<checks<<" failures=0\n";
}
