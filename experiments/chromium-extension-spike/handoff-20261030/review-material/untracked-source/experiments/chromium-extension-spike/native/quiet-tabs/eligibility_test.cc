#include "eligibility.h"
#include <cassert>
using namespace blanc::quiet;
Snapshot Clean() {
  Snapshot s;
  s.window=1; s.tab=2; s.document=3; s.retained_snapshots=0;
  s.hazards.fill(Observation::kNo);
  s.restorable_http_history=s.native_eligible=s.storage_preserved=Observation::kYes;
  return s;
}
int main() {
  assert(Assess(Snapshot{}) != Verdict::kEligible);
  const auto clean=Clean();
  assert(Revalidate(clean,clean)==Verdict::kEligible);
  for(size_t i=0;i<static_cast<size_t>(Hazard::kCount);++i) {
    auto current=clean; current.hazards[i]=Observation::kYes;
    assert(Revalidate(clean,current)==Verdict::kProtected);
    current.hazards[i]=Observation::kUnknown;
    assert(Revalidate(clean,current)==Verdict::kUnknown);
  }
  for(auto member : {&Snapshot::window,&Snapshot::tab,&Snapshot::document}) {
    auto current=clean; ++(current.*member);
    assert(Revalidate(clean,current)==Verdict::kChanged);
  }
  for(auto member : {&Snapshot::restorable_http_history,&Snapshot::native_eligible,&Snapshot::storage_preserved}) {
    auto current=clean; current.*member=Observation::kUnknown;
    assert(Revalidate(clean,current)==Verdict::kUnknown);
    current.*member=Observation::kNo;
    assert(Revalidate(clean,current)==Verdict::kProtected);
  }
  auto full=clean; full.retained_snapshots=50;
  assert(Revalidate(clean,full)==Verdict::kAtCapacity);
  full.retained_snapshots=49;
  assert(Revalidate(clean,full)==Verdict::kEligible);
}
