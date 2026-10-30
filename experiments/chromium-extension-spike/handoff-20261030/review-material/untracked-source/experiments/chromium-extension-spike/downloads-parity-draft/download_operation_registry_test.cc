#include "download_operation_registry.h"
#include <cassert>
#include <iostream>
int main() {
  using R=DownloadOperationRegistry; R r;
  const R::ItemKey a{"regular-epoch", "a"}, b{"regular-epoch", "b"}, private_a{"private-epoch", "a"};
  assert(!r.BeginItem("", a, R::Action::kOpen)); assert(!r.BeginItem("p", {"", "x"}, R::Action::kOpen));
  auto op_a=r.BeginItem("p", a, R::Action::kOpen), op_b=r.BeginItem("p", b, R::Action::kCancel);
  auto op_private=r.BeginItem("p",private_a,R::Action::kShow); assert(op_a&&op_b&&op_private);
  assert(r.List("p").size()==3 && r.List("unknown").empty());
  assert(!r.BeginItem("p",a,R::Action::kRetry)); assert(!r.BeginClear("p",{a}));
  auto other=r.BeginClear("q",{a}); assert(other); assert(!r.BeginItem("q",a,R::Action::kOpen));
  assert(!r.Acknowledge("p",*op_a)); assert(!r.RetireFamily("p"));
  assert(!r.MarkDispatched("q",*op_a)); assert(!r.ObserveTerminal("p",*op_a,R::Result::kSucceeded));
  assert(r.MarkDispatched("p",*op_a)); assert(!r.DenyBeforeDispatch("p",*op_a));
  assert(!r.Acknowledge("p",*op_a)); assert(!r.BeginItem("p",a,R::Action::kOpen));
  assert(!r.ObserveTerminal("p",*op_a,R::Result::kDeniedBeforeDispatch));
  assert(r.ObserveTerminal("p",*op_a,R::Result::kSucceeded)); assert(!r.ObserveTerminal("p",*op_a,R::Result::kConfirmedFailure));
  assert(!r.BeginItem("p",a,R::Action::kRetry)); assert(r.FindItem("p",a)->token==*op_a); assert(r.Acknowledge("p",*op_a));
  auto clear=r.BeginClear("p",{a}); assert(clear); assert(!r.BeginClear("p",{}));
  assert(r.Find("p",*clear)->clear && !r.Find("p",*clear)->action); assert(r.ClearItems("p",*clear)->size()==1);
  assert(!r.ClearItems("q",*clear)); assert(r.ClearItems("q",*other)->size()==1);
  assert(!r.BeginItem("p",a,R::Action::kOpen)); auto c=r.BeginItem("p",{"regular-epoch","c"},R::Action::kOpen); assert(c);
  assert(r.MarkDispatched("p",*clear)); assert(!r.Acknowledge("p",*clear));
  assert(r.ObserveTerminal("p",*clear,R::Result::kSucceeded)); assert(r.Acknowledge("p",*clear));
  assert(r.DenyBeforeDispatch("p",*op_b)); assert(r.Acknowledge("p",*op_b));
  assert(r.MarkDispatched("p",*op_private)); assert(r.ObserveTerminal("p",*op_private,R::Result::kConfirmedFailure)); assert(r.Acknowledge("p",*op_private));
  assert(r.DenyBeforeDispatch("p",*c)); assert(r.Acknowledge("p",*c)); assert(r.RetireFamily("p"));
  assert(!r.BeginClear("p",{a,a})); assert(!r.BeginClear("p",{{"", "x"}}));
  auto empty=r.BeginClear("p",{}); assert(empty && r.ClearItems("p",*empty) && r.ClearItems("p",*empty)->empty());
  assert(r.DenyBeforeDispatch("p",*empty)); assert(r.Acknowledge("p",*empty));
  assert(r.DenyBeforeDispatch("q",*other)); assert(r.Acknowledge("q",*other));
  std::cout << "PASS isolated operation lifetime, terminal semantics, snapshot conflicts and context keys\n";
}
