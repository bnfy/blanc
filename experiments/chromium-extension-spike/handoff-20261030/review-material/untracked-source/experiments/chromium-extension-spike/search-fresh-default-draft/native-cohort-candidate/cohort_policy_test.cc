#include "cohort_policy.h"
#include <cassert>
#include <iostream>
int main() {
  using blanc_cohort::Eligible;
  using blanc_cohort::Facts;
  assert(Eligible(Facts{true,true,false,true,false}));
  assert(!Eligible(Facts{false,true,false,true,false}));
  assert(!Eligible(Facts{true,false,false,true,false}));
  assert(!Eligible(Facts{true,true,true,true,false}));
  assert(!Eligible(Facts{true,true,false,false,false}));
  assert(!Eligible(Facts{true,true,false,true,true}));
  unsigned accepted=0;
  for (unsigned m=0;m<32;++m) {
    Facts f{bool(m&1),bool(m&2),bool(m&4),bool(m&8),bool(m&16)};
    if(Eligible(f)) { ++accepted; assert(m==11); }
  }
  assert(accepted==1);
  for (bool fallback : {false,true}) for (int id : {92,99})
    for (bool introduced : {false,true}) for (bool exists : {false,true})
      for (bool safe : {false,true})
        assert(blanc_cohort::RejectEditedCollision(fallback,id,introduced,exists,safe) ==
               (fallback && id==92 && introduced && (!exists || !safe)));
  for (int count : {0,1,2}) for (bool exact : {false,true})
    assert(blanc_cohort::AcceptCanonicalDdg(count,exact) == (count==1 && exact));
  std::cout << "32 cohort guard combinations passed\n";
}
