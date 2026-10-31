#include "dispatch_guard.h"
#include <cassert>
using namespace blanc::bangs::draft;
int main() {
  Context regular{1,2,3,4,5,false},priv{1,2,6,7,5,true};
  DispatchGuard g;
  auto t=g.Begin(regular);assert(t&&g.pending()==1);
  assert(g.Complete(*t,regular,true)==Completion::kRegular);
  assert(g.Complete(*t,regular,true)==Completion::kStale);
  t=g.Begin(priv);assert(t&&g.Complete(*t,priv,true)==Completion::kPrivate);
  t=g.Begin(priv);assert(t&&g.Complete(*t,priv,false)==Completion::kNoResolution);
  for (int which=0;which<6;++which) {
    t=g.Begin(regular);assert(t);auto changed=regular;
    if(which==0) ++changed.window;if(which==1) ++changed.profile;
    if(which==2) ++changed.tab;if(which==3) ++changed.document;
    if(which==4) ++changed.settings_revision;if(which==5) changed.is_private=true;
    assert(g.Complete(*t,changed,true)==Completion::kStale);
  }
  auto first=g.Begin(regular),second=g.Begin(regular);assert(first&&second);
  assert(g.Complete(*first,regular,true)==Completion::kStale);
  assert(g.Complete(*second,regular,true)==Completion::kRegular);
  Context invalid=regular;invalid.document=0;assert(!g.Begin(invalid));
  for (uint64_t i=0;i<32;++i){auto c=regular;c.tab=100+i;assert(g.Begin(c));}
  auto extra=regular;extra.tab=200;assert(!g.Begin(extra));
  g.CancelTab(100);assert(g.Begin(extra));g.CancelWindow(1);assert(g.pending()==0);
  t=g.Begin(regular);assert(t);g.Shutdown();assert(g.pending()==0);
  assert(g.Complete(*t,regular,true)==Completion::kStale&&!g.Begin(regular));
}
