#include <iomanip>
#include <iostream>
#include <sstream>
#include "request_scheduler.h"
using namespace blanc::sync;
char Code(RequestClass c) { return "ISFR"[static_cast<int>(c)]; }
int main() {
  double wall = 1000000, mono = 10000;
  int limit = 10; double window = 60000;
  auto make = [&](std::optional<SchedulerState> state = std::nullopt) {
    return std::make_unique<RequestScheduler>([&] { return wall; }, [&] { return mono; }, limit, window, state);
  };
  auto scheduler = make(); SchedulerState saved;
  std::vector<std::shared_ptr<RequestScheduler::Reservation>> records;
  std::cout << std::setprecision(17);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line); std::string op, value; in >> op;
    if (op == "init") { in >> limit >> window; scheduler = make(); records.clear(); }
    else if (op == "clock") in >> wall >> mono;
    else if (op == "can") value = scheduler->CanRequest() ? "true" : "false";
    else if (op == "free") { std::ostringstream out; out << std::setprecision(17) << scheduler->WindowFreesAt(); value = out.str(); }
    else if (op == "record") { auto event = scheduler->Record(); value = event ? "true" : "false"; records.push_back(event); }
    else if (op == "settle") { size_t id; in >> id; scheduler->Settle(records.at(id)); }
    else if (op == "rate") scheduler->OnRateLimited();
    else if (op == "mark") scheduler->MarkIndexDue();
    else if (op == "save") saved = scheduler->Snapshot();
    else if (op == "restore") { scheduler = make(saved); records.clear(); }
    else if (op == "pick") {
      PendingWork work; in >> work.index;
      for (auto kind : {RequestClass::kSpace, RequestClass::kFixed, RequestClass::kRemote}) {
        size_t count; in >> count;
        for (size_t i = 0; i < count; ++i) { std::string id; in >> id; work.items[kind].push_back(id); }
      }
      const auto selected = scheduler->Next(work);
      value = selected ? std::string(1, Code(selected->kind)) + ":" + selected->item : "-";
    } else if (op != "snapshot") return 2;
    const auto state = scheduler->Snapshot();
    std::cout << op << '|' << value << "|log=";
    for (size_t i = 0; i < state.log.size(); ++i) std::cout << (i ? "," : "") << state.log[i];
    std::cout << ";next=" << Code(state.next) << ";cap=" << state.window_limit << ";backoff=";
    if (state.backoff_until) std::cout << *state.backoff_until; else std::cout << '-';
    for (auto kind : kClasses) {
      std::cout << ';' << Code(kind) << '=';
      if (const auto it = state.cursors.find(kind); it != state.cursors.end()) std::cout << it->second;
    }
    std::cout << '\n';
  }
}
