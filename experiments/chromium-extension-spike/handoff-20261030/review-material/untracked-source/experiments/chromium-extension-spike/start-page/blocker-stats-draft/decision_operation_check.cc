#include "decision_operation.h"
#include <cstdio>
#include <memory>
using blanc::blocker_stats::DecisionOperation;
int main() {
  int checks=0, failures=0, blocks=0, writes=0;
  auto check=[&](bool ok,const char* label){++checks;if(!ok){++failures;std::fprintf(stderr,"FAIL %s\n",label);}};
  auto allowed=[&]{++blocks; ++writes;};
  for (int path=0; path<5; ++path) { // loader, response, activation, socket, transport
    DecisionOperation operation;
    check(!operation.OnDecision(0, allowed),"allowed does not count");
    check(operation.OnDecision(1, allowed),"first rule block counts");
    check(!operation.OnDecision(1, allowed),"duplicate does not count");
    check(!operation.OnDecision(0, allowed),"terminal remains closed");
  }
  check(blocks==5 && writes==5,"each path counted once");
  DecisionOperation redirect;
  check(!redirect.OnDecision(0,allowed),"redirect first allow");
  check(!redirect.OnDecision(0,allowed),"redirect second allow");
  check(redirect.OnDecision(1,allowed),"redirect terminal block");
  check(!redirect.OnDecision(1,allowed),"redirect repeat ignored");
  for (int error : {-1, 2, 3}) {
    DecisionOperation operation;
    check(!operation.OnDecision(error,allowed),"failure not counted");
    check(!operation.OnDecision(1,allowed),"late block after failure ignored");
  }
  int calls=0; DecisionOperation reentrant;
  check(reentrant.OnDecision(1,[&]{++calls; reentrant.OnDecision(1,[&]{++calls;});}),"outer block sent");
  check(calls==1,"reentrant callback cannot duplicate");
  auto lifetime=std::make_unique<DecisionOperation>();
  auto* raw=lifetime.get();
  check(raw->OnDecision(1,[&]{lifetime.reset();}),"destructive callback safe");
  check(!lifetime,"operation destroyed by callback");
  auto shared=std::make_shared<DecisionOperation>();
  auto loader=shared, response=shared;
  check(loader->OnDecision(1,allowed),"shared loader event");
  check(!response->OnDecision(1,allowed),"shared response duplicate suppressed");
  // Sharing is safe only when the actual browser supplies operation identity;
  // this test does NOT prove loader and response objects can be joined.
  DecisionOperation first, second;
  check(first.OnDecision(1,allowed) && second.OnDecision(1,allowed),"separate requests both count");
  bool regular=true; int admitted=0;
  auto gate=[&]{if(regular) ++admitted;};
  DecisionOperation regular_op; regular_op.OnDecision(1,gate);
  regular=false; DecisionOperation private_op; private_op.OnDecision(1,gate);
  check(admitted==1,"fake sink excludes private context");
  std::printf("decision-operation checks=%d failures=%d\n",checks,failures);
  return failures ? 1 : 0;
}
