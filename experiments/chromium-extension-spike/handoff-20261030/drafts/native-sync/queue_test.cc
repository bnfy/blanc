#include <cassert>
#include <deque>
#include <iostream>
#include <set>
#include <sstream>
#include "request_queue.h"
using namespace blanc::sync;
using Queue = RequestQueue<std::string>;
struct Harness {
  double wall = 1000000, mono = 0;
  std::deque<Queue::Task> tasks;
  std::optional<std::pair<double, Queue::Task>> timer;
  std::vector<Queue::Task> cancelled_timers;
  std::vector<std::string> runs, results;
  std::set<int> fail_writes;
  int writes = 0, arms = 0, cancels = 0;
  std::shared_ptr<RequestScheduler> scheduler;
  std::shared_ptr<Queue> queue;
  explicit Harness(int limit = 10) {
    scheduler = std::make_shared<RequestScheduler>([&] { return wall; }, [&] { return mono; }, limit);
    queue = Queue::Create(scheduler, [&](const auto&) -> std::optional<std::string> {
      if (fail_writes.contains(++writes)) return "disk-full";
      return std::nullopt;
    }, [&](auto task) { tasks.push_back(std::move(task)); },
       [&](double delay, auto task) { ++arms; timer = {mono + delay, std::move(task)}; },
       [&] { ++cancels; if (timer) cancelled_timers.push_back(timer->second); timer.reset(); },
       [&] { return wall; });
  }
  void Flush() {
    size_t count = 0;
    while (!tasks.empty()) { assert(++count < 10000); auto task = std::move(tasks.front()); tasks.pop_front(); task(); }
  }
  void Advance(double ms) {
    wall += ms; mono += ms;
    if (timer && timer->first <= mono) { auto task = std::move(timer->second); timer.reset(); task(); }
    Flush();
  }
  Queue::Completed Save(std::string id) {
    return [&, id = std::move(id)](const auto& result) {
      results.push_back(id + ":" + (result.error.empty() ? result.outcome.value_or("null") : result.error));
    };
  }
  Queue::Request Request(std::string id, RequestClass kind = RequestClass::kFixed) {
    Queue::Request request; request.kind = kind; request.item = id; request.generation = "account-a";
    request.run = [&, id](size_t attempt, auto complete) {
      assert(writes > 0); runs.push_back(id + ":" + std::to_string(attempt)); complete({"ok", false, {}});
    };
    return request;
  }
};
int main() {
  int tests = 0;
  std::vector<std::string> comparisons;
  const auto summarize = [&](const std::string& name, Harness& h) {
    std::ostringstream out; out << name << "|";
    for (size_t i = 0; i < h.runs.size(); ++i) out << (i ? "," : "") << h.runs[i];
    out << "|";
    for (size_t i = 0; i < h.results.size(); ++i) out << (i ? "," : "") << h.results[i];
    const auto status = h.queue->GetStatus();
    out << "|" << h.writes << "|" << status.waiting << "|" << status.running << "|" << status.consecutive_rate_limits;
    comparisons.push_back(out.str());
  };
  {
    Harness h; int observed = 0; auto first = h.Request("settings");
    first.on_outcome = [&](const auto&) { ++observed; return false; };
    auto duplicate = h.Request("settings"); duplicate.run = [&](auto, auto) { assert(false); };
    h.queue->Enqueue(first, h.Save("a")); h.queue->Enqueue(duplicate, h.Save("b"));
    assert(h.queue->GetStatus().waiting == 1); bool drained = false;
    h.queue->Settled([&] { drained = true; }); h.Flush();
    assert(h.runs.size() == 1 && h.results.size() == 2 && observed == 1 && drained && h.writes == 2); summarize("coalesce", h); ++tests;
  }
  {
    Harness h; h.fail_writes = {1}; h.queue->Enqueue(h.Request("settings"), h.Save("a")); h.Flush();
    assert(h.runs.empty() && h.results == std::vector<std::string>{"a:disk-full"});
    h.queue->Enqueue(h.Request("bookmarks"), h.Save("b")); h.Flush();
    assert(h.runs == std::vector<std::string>{"bookmarks:0"}); assert(!h.queue->GetStatus().running); summarize("reservation-fault", h); ++tests;
  }
  {
    Harness h; h.fail_writes = {2}; h.queue->Enqueue(h.Request("settings"), h.Save("a")); h.Flush();
    assert(h.runs.size() == 1 && h.results == std::vector<std::string>{"a:disk-full"});
    assert(h.scheduler->Snapshot().log.size() == 1); summarize("settlement-fault", h); ++tests;
  }
  {
    Harness h; h.fail_writes = {3}; auto request = h.Request("settings");
    request.run = [&](auto, auto complete) { h.runs.push_back("rate"); complete({{}, false, "http-429"}); };
    h.queue->Enqueue(request, h.Save("a")); h.Flush();
    assert(h.results == std::vector<std::string>{"a:disk-full"});
    assert(h.queue->GetStatus().consecutive_rate_limits == 1 && h.queue->GetStatus().backoff); summarize("backoff-fault", h); ++tests;
  }
  {
    Harness h; for (auto kind : kClasses) {
      const auto id = kind == RequestClass::kIndex ? "spaces" : kind == RequestClass::kSpace ? "a" : kind == RequestClass::kFixed ? "settings" : "peer";
      auto request = h.Request(id, kind);
      if (kind == RequestClass::kSpace) request.run = [&](size_t attempt, auto complete) {
        h.runs.push_back("a:" + std::to_string(attempt)); complete({"ok", attempt == 0, {}});
      };
      h.queue->Enqueue(request, h.Save(id));
    }
    h.Flush(); assert((h.runs == std::vector<std::string>{"spaces:0", "a:0", "settings:0", "peer:0", "a:1"}));
    assert(h.results.size() == 4 && h.writes == 10); summarize("retry-rotation", h); ++tests;
  }
  {
    Harness h; std::vector<Queue::TransportCompleted> completions;
    auto request = h.Request("settings"); request.run = [&](size_t attempt, auto complete) {
      h.runs.push_back(std::to_string(attempt)); completions.push_back(complete);
    };
    h.queue->Enqueue(request, h.Save("a")); h.Flush();
    completions[0]({"merge", true, {}}); h.Flush(); assert(completions.size() == 2);
    completions[0]({"stale", false, {}}); h.Flush(); assert(h.results.empty() && h.queue->GetStatus().running);
    completions[1]({"final", false, {}}); h.Flush(); assert(h.results == std::vector<std::string>{"a:final"}); ++tests;
  }
  {
    Harness h; bool changed = false; Queue::TransportCompleted complete;
    auto request = h.Request("settings"); request.cancelled = [&] { return changed ? "account-changed" : ""; };
    request.run = [&](auto, auto callback) { complete = callback; };
    h.queue->Enqueue(request, h.Save("a")); h.Flush(); changed = true;
    complete({"must-not-apply", false, {}}); h.Flush();
    assert(h.results == std::vector<std::string>{"a:cancelled:account-changed"}); assert(h.writes == 2); summarize("inflight-cancel", h); ++tests;
  }
  {
    Harness h; auto old = h.Request("settings"), next = h.Request("settings"); next.generation = "account-b";
    h.queue->Enqueue(old, h.Save("old")); h.queue->Enqueue(next, h.Save("new"));
    assert(h.queue->GetStatus().waiting == 2);
    h.queue->CancelWhere([](const auto& request) { return request.generation == "account-a"; }, "account-changed");
    h.Flush(); assert((h.results == std::vector<std::string>{"old:cancelled:account-changed", "new:ok"}));
    assert(h.runs.size() == 1 && h.writes == 2); summarize("queued-generation", h); ++tests;
  }
  {
    Harness h; auto request = h.Request("settings"); request.cancelled = [] { return "disabled"; };
    h.queue->Enqueue(request, h.Save("a")); h.Flush();
    assert(h.writes == 0 && h.runs.empty() && h.results == std::vector<std::string>{"a:cancelled:disabled"}); summarize("pre-cancel", h); ++tests;
  }
  {
    Harness h; Queue::TransportCompleted complete; auto first = h.Request("settings");
    first.run = [&](auto, auto callback) { h.runs.push_back("first"); complete = callback; };
    h.queue->Enqueue(first, h.Save("a")); h.Flush();
    h.queue->Enqueue(h.Request("settings"), h.Save("b")); assert(h.queue->GetStatus().waiting == 1);
    complete({"ok", false, {}}); h.Flush(); assert(h.runs.size() == 2 && h.results.size() == 2); ++tests;
  }
  {
    Harness h(2); for (auto id : {"bookmarks", "settings", "session"}) h.queue->Enqueue(h.Request(id), h.Save(id));
    bool drained = false; h.queue->Settled([&] { drained = true; }); h.Flush();
    assert(h.runs.size() == 2 && h.queue->GetStatus().waiting == 1 && !drained);
    h.Advance(59999); assert(h.runs.size() == 2); h.Advance(1);
    assert(h.runs.size() == 3 && drained); summarize("rolling-window", h); ++tests;
  }
  {
    Harness h; auto add = [&](std::string error) {
      auto request = h.Request("settings"); request.run = [error](auto, auto complete) { complete({error.empty() ? std::optional<std::string>("ok") : std::nullopt, false, error}); };
      h.queue->Enqueue(request, h.Save("a")); h.Flush();
    };
    add("http-429"); add("rate-limited"); assert(h.queue->GetStatus().consecutive_rate_limits == 2);
    add("http-500"); assert(h.queue->GetStatus().consecutive_rate_limits == 2);
    add(""); h.Advance(60000); assert(h.queue->GetStatus().consecutive_rate_limits == 0); summarize("rate-status", h); ++tests;
  }
  {
    Harness h; for (const auto& [id, priority] : std::vector<std::pair<std::string, int>>{{"a", 1}, {"c", 0}, {"b", 0}}) {
      auto request = h.Request(id, RequestClass::kSpace); request.priority = priority; h.queue->Enqueue(request, h.Save(id));
    }
    h.Flush(); assert((h.runs == std::vector<std::string>{"b:0", "c:0", "a:0"})); summarize("pending-priority", h); ++tests;
  }
  {
    Harness h(1); h.queue->Enqueue(h.Request("bookmarks"), h.Save("a")); h.queue->Enqueue(h.Request("settings"), h.Save("b")); h.Flush();
    h.queue->Enqueue(h.Request("session"), h.Save("c")); h.Flush(); assert(h.cancelled_timers.size() == 1);
    h.cancelled_timers[0](); h.Flush();
    h.queue->Enqueue(h.Request("icons"), h.Save("d")); h.Flush(); assert(h.cancels == 2); ++tests;
  }
  {
    Harness h; int observers = 0;
    for (const auto* id : {"a", "b", "c"}) {
      auto request = h.Request(id);
      request.on_outcome = [&](const auto&) {
        ++observers;
        h.queue->CancelWhere([](const auto&) { return true; }, "nested");
        return true;
      };
      h.queue->Enqueue(request, h.Save(id));
    }
    h.queue->CancelWhere([](const auto&) { return true; }, "outer"); h.Flush();
    assert(observers == 3 && h.results.size() == 3 && h.runs.empty()); ++tests;
  }
  {
    Harness h; bool settled = false; auto request = h.Request("settings");
    request.on_outcome = [&](const auto&) {
      h.queue->RunningSettled([&] { settled = true; }); return true;
    };
    h.queue->Enqueue(request, h.Save("a")); h.Flush();
    assert(settled && h.results.size() == 1); ++tests;
  }
  for (const auto& line : comparisons) std::cout << line << "\n";
  std::cout << "{\"status\":\"passed\",\"nativeFailureAndLifecycleCases\":" << tests << "}\n";
}
