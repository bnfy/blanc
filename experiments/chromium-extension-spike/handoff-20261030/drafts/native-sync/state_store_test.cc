#include "request_state_store.h"
#include "request_queue.h"
#include "base/at_exit.h"
#include "base/check.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include <deque>
#include <iostream>
using namespace blanc::sync;
using Status = RequestStateStore::Status;
int main(int argc, char** argv) {
  base::AtExitManager at_exit;
  CHECK_EQ(argc, 3);
  const base::FilePath folder = base::FilePath::FromUTF8Unsafe(argv[2]);
  CHECK(folder.IsAbsolute());
  const auto path = folder.AppendASCII("request-state.json");
  RequestStateStore store(path, std::string(64, 'a'));
  if (std::string(argv[1]) == "seed") {
    CHECK(base::CreateDirectory(folder));
    CHECK(store.Load().status == Status::kMissing);
    CHECK(store.Commit(SchedulerState{}) == Status::kMissing);
    CHECK(store.InitializeNew() == Status::kLoaded);
    SchedulerState state; state.log = {1000000, 1000001};
    state.next = RequestClass::kRemote; state.cursors[RequestClass::kSpace] = "space-a";
    state.window_limit = 5; state.backoff_until = 1300000;
    CHECK(store.Commit(state) == Status::kLoaded);
    std::cout << "seed passed\n"; return 0;
  }
  CHECK_EQ(std::string(argv[1]), "verify");
  auto loaded = store.Load(); CHECK(loaded.status == Status::kLoaded);
  CHECK(loaded.state->log == std::vector<double>({1000000, 1000001}));
  CHECK(loaded.state->next == RequestClass::kRemote);
  CHECK_EQ(loaded.state->cursors.at(RequestClass::kSpace), "space-a");
  CHECK_EQ(loaded.state->window_limit, 5);
  CHECK(loaded.state->backoff_until == 1300000);
  CHECK(store.InitializeNew() == Status::kAlreadyExists);
  RequestStateStore wrong(path, std::string(64, 'b'));
  CHECK(wrong.Load().status == Status::kWrongAccount);
  CHECK(wrong.Commit(SchedulerState{}) == Status::kWrongAccount);
  RequestStateStore invalid(path, "../account");
  CHECK(invalid.InitializeNew() == Status::kInvalidBinding);
  std::string good; CHECK(base::ReadFileToString(path, &good));
  for (const auto& bytes : {std::string(), std::string("{"),
                           std::string(16385, 'x')}) {
    CHECK(base::WriteFile(path, bytes));
    CHECK(store.Load().status == Status::kCorrupt);
    CHECK(store.InitializeNew() == Status::kCorrupt);
    CHECK(store.Commit(SchedulerState{}) == Status::kCorrupt);
  }
  CHECK(base::WriteFile(path, good));
  auto root = base::JSONReader::ReadDict(good, base::JSON_PARSE_RFC);
  CHECK(root);
  root->Set("windowLimit", 11);
  CHECK(base::WriteFile(path, *base::WriteJson(*root)));
  CHECK(store.Load().status == Status::kCorrupt);
  CHECK(base::WriteFile(path, good));
  SchedulerState bad; bad.log.assign(11, 1000000);
  CHECK(store.Commit(bad) == Status::kCorrupt);
  std::string unchanged; CHECK(base::ReadFileToString(path, &unchanged));
  CHECK_EQ(unchanged, good);
  // Real queue persistence barrier: loss of the file after successful load
  // prevents any transport callback and does not wedge drain completion.
  auto scheduler = std::make_shared<RequestScheduler>([] { return 1000002.; },
      [] { return 0.; }, 10, 60000, store.Load().state);
  using Queue = RequestQueue<std::string>;
  std::deque<Queue::Task> tasks;
  auto queue = Queue::Create(scheduler, [&](const auto& state)
      -> std::optional<std::string> {
    return store.Commit(state) == Status::kLoaded ? std::nullopt
        : std::optional<std::string>("request-log-save-failed");
  }, [&](auto task) { tasks.push_back(std::move(task)); },
  [](double, auto) { CHECK(false); }, [] {}, [] { return 1000002.; });
  bool dispatched = false, completed = false, drained = false;
  Queue::Request request; request.kind = RequestClass::kFixed;
  request.item = "settings"; request.generation = "account-a";
  request.run = [&](auto, auto complete) {
    dispatched = true;
    auto before = store.Load(); CHECK(before.status == Status::kLoaded);
    CHECK_EQ(before.state->log.size(), 3u);
    complete({"ok", false, {}});
  };
  queue->Enqueue(request, [&](const auto& result) {
    CHECK(result.error.empty() && result.outcome == "ok"); completed = true;
  });
  while (!tasks.empty()) { auto task = std::move(tasks.front()); tasks.pop_front(); task(); }
  CHECK(dispatched && completed);
  auto settled = store.Load(); CHECK(settled.status == Status::kLoaded);
  CHECK_EQ(settled.state->log.size(), 3u);
  CHECK_EQ(settled.state->log.back(), 1000002.);
  CHECK_EQ(settled.state->cursors.at(RequestClass::kFixed), "settings");
  CHECK(base::DeleteFile(path));
  dispatched = completed = false;
  request.run = [&](auto, auto) { dispatched = true; };
  queue->Enqueue(request, [&](const auto& result) {
    CHECK_EQ(result.error, "request-log-save-failed"); completed = true;
  });
  queue->Settled([&] { drained = true; });
  while (!tasks.empty()) { auto task = std::move(tasks.front()); tasks.pop_front(); task(); }
  CHECK(!dispatched && completed && drained);
  CHECK(store.Load().status == Status::kMissing);
  // Missing parent causes actual atomic writer failure, without creating it.
  RequestStateStore no_parent(folder.AppendASCII("absent/state.json"), std::string(64, 'a'));
  CHECK(no_parent.InitializeNew() == Status::kWriteError);
  std::cout << "restart, account binding, corruption, bounds, actual disk failures and queue barrier passed\n";
}
