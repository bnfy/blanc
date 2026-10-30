#include "restart_safe_cohort.h"
#include <cassert>
#include <iostream>
using namespace blanc::fresh_default;
int main(){
 int checks=0;
 auto expect=[&](const CohortSnapshot& x,Action a){assert(DecideCohort(x)==a);++checks;};
 CohortSnapshot x;expect(x,Action::kPreserve);
 x.regular=true;x.origin=Origin::kCurrentExclusiveProof;expect(x,Action::kWait);
 x.import_state_known=true;expect(x,Action::kPreserve);
 x.no_import_or_restore=true;expect(x,Action::kPersistPending);
 // Crash before durable pending: restart cannot infer a fresh profile.
 x.origin=Origin::kVerifiedRestart;expect(x,Action::kPreserve);
 x.record=Record::kPending;expect(x,Action::kPreserve);
 x.verified_record_binding=true;expect(x,Action::kWait);
 x.identity_ready=true;x.model_ready=true;x.source=Source::kFallback;x.untouched_provider_prefs=true;x.no_override=true;x.no_account=true;x.choice_definitely_outside_scope=true;expect(x,Action::kCommitCohort);
 // A crash before or during commit still cannot use a pending cohort.
 expect(x,Action::kCommitCohort);
 x.record=Record::kCommitted;expect(x,Action::kUseDuckDuckGoFallback);
 // Copied, corrupt, missing and mismatched identity records never enroll.
 x.verified_record_binding=false;expect(x,Action::kPreserve);x.verified_record_binding=true;
 x.origin=Origin::kUnverified;expect(x,Action::kPreserve);x.origin=Origin::kVerifiedRestart;
 x.record=Record::kCorrupt;expect(x,Action::kPreserve);x.record=Record::kRetired;expect(x,Action::kPreserve);
 x.record=Record::kPending;
 for(auto source:{Source::kUser,Source::kExtension,Source::kPolicy,Source::kRecommendedPolicy}){x.source=source;expect(x,Action::kRetirePending);}
 x.source=Source::kFallback;x.untouched_provider_prefs=false;expect(x,Action::kRetirePending);x.untouched_provider_prefs=true;
 x.no_override=false;expect(x,Action::kRetirePending);x.no_override=true;
 x.import_state_known=false;expect(x,Action::kWait);x.import_state_known=true;
 x.no_import_or_restore=false;expect(x,Action::kRetirePending);x.no_import_or_restore=true;
 x.no_account=false;expect(x,Action::kRetirePending);x.no_account=true;
 x.choice_definitely_outside_scope=false;expect(x,Action::kRetirePending);x.choice_definitely_outside_scope=true;
 x.identity_ready=false;expect(x,Action::kWait);x.identity_ready=true;
 x.model_ready=false;expect(x,Action::kWait);x.model_ready=true;
 x.source=Source::kUnknown;expect(x,Action::kWait);x.source=Source::kFallback;
 // When committed, user/managed/override cases take native precedence.
 x.record=Record::kCommitted;x.source=Source::kUser;expect(x,Action::kPreserve);
 x.source=Source::kFallback;x.no_override=false;expect(x,Action::kPreserve);x.no_override=true;
 // Later account sign-in must not silently fall back to another provider.
 // Hold until remote selection is reconciled, then keep the cohort fallback
 // only if no user/policy/extension provider has become effective.
 x.no_account=false;x.sync_reconciled=false;expect(x,Action::kWait);
 x.sync_reconciled=true;expect(x,Action::kUseDuckDuckGoFallback);
 x.source=Source::kUser;expect(x,Action::kPreserve);
 x.regular=false;expect(x,Action::kPreserve);
 CandidateSet set;assert(!set.SafeUnique());++checks;
 set.Add(92,"https://duckduckgo.com/?q={searchTerms}",true,false,false);assert(set.SafeUnique());++checks;
 set.Add(92,"https://attacker.invalid/?q={searchTerms}",true,false,false);assert(!set.SafeUnique());++checks;
 CandidateSet modified;modified.Add(92,"https://duckduckgo.com/?q={searchTerms}",true,true,false);assert(!modified.SafeUnique());++checks;
 CandidateSet post;post.Add(92,"https://duckduckgo.com/?q={searchTerms}",true,false,true);assert(!post.SafeUnique());++checks;
 CandidateSet nonnormal;nonnormal.Add(92,"https://duckduckgo.com/?q={searchTerms}",false,false,false);assert(!nonnormal.SafeUnique());++checks;
 std::cout<<"restart cohort policy checks="<<checks<<" failures=0; no journal or browser used\n";
}
