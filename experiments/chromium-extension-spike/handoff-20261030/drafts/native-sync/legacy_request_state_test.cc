#include "legacy_request_state.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/json/json_writer.h"
#include <iostream>
using namespace blanc::sync;
int main() {
  base::AtExitManager at_exit;
  base::DictValue source; base::ListValue log;
  for (int i=0;i<10;++i) log.Append(100000.0+i);
  source.Set("requestLog", std::move(log)); source.Set("nextClass", "S");
  source.Set("windowLimit", 3); source.Set("backoffUntil", 400000.0);
  base::DictValue cursors; cursors.Set("F", "settings"); source.Set("cursors", std::move(cursors));
  const auto parse = [](const base::DictValue& d) { return ParseLegacyRequestState(*base::WriteJson(d)); };
  const auto state = parse(source); CHECK(state); CHECK_EQ(state->log.size(), 10u);
  CHECK_EQ(state->window_limit, 3); CHECK(state->next == RequestClass::kSpace);
  CHECK_EQ(*state->backoff_until, 400000); CHECK_EQ(state->cursors.at(RequestClass::kFixed), "settings");
  double wall=100010, mono=0;
  RequestScheduler restored([&]{return wall;},[&]{return mono;},10,60000,*state);
  CHECK(restored.IsValid()); CHECK(!restored.CanRequest());
  // Migration restart/rollback retains a full monotonic window, including
  // timestamps now in the future. It does not refund charged wire requests.
  wall=1; RequestScheduler rollback([&]{return wall;},[&]{return mono;},10,60000,*state);
  CHECK(!rollback.CanRequest()); mono=59999; CHECK(!rollback.CanRequest());
  mono=60000; CHECK(rollback.CanRequest());
  CHECK_EQ(rollback.Snapshot().window_limit, 3);
  for (const char* field : {"requestLog","nextClass","cursors","windowLimit","backoffUntil"}) {
    auto bad=source.Clone(); bad.Set(field, "invalid"); CHECK(!parse(bad));
  }
  auto bad=source.Clone(); bad.FindList("requestLog")->Append(100020.0); CHECK(!parse(bad));
  bad=source.Clone(); bad.Set("windowLimit", 11); CHECK(!parse(bad));
  CHECK(!ParseLegacyRequestState("{}")); CHECK(!ParseLegacyRequestState("[]"));
  auto defaults=ParseLegacyRequestState("{\"requestLog\":[]}"); CHECK(defaults);
  CHECK_EQ(defaults->window_limit,10); CHECK(defaults->log.empty());
  std::cout << "legacy quota charge/backoff/cursor preservation, rollback window and invalid-ledger refusal passed\n";
}
