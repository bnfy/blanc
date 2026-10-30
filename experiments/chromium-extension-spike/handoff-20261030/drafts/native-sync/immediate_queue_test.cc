#include "request_queue.h"
#include "base/check.h"
#include "base/at_exit.h"
#include "base/check_op.h"
#include <deque>
#include <iostream>
using namespace blanc::sync;
using Q=RequestQueue<std::string>;
int main(){
 base::AtExitManager at_exit;
 double wall=1000,mono=1000;std::deque<Q::Task> tasks;int timers=0,runs=0,persists=0;SchedulerState saved;
 auto scheduler=std::make_shared<RequestScheduler>([&]{return wall;},[&]{return mono;},1);
 auto queue=Q::Create(scheduler,[&](const SchedulerState& s)->std::optional<std::string>{saved=s;++persists;return {};},[&](Q::Task t){tasks.push_back(std::move(t));},[&](double,Q::Task){++timers;},[]{},[&]{return wall;});CHECK(queue);
 auto pump=[&]{int bound=100;while(!tasks.empty()){CHECK_GT(--bound,0);auto t=std::move(tasks.front());tasks.pop_front();t();}};
 CHECK(queue->CanRunImmediately());
 Q::Request request;request.item="session";request.immediate_only=true;
 request.run=[&](size_t attempt,Q::TransportCompleted done){CHECK_EQ(attempt,0u);++runs;done({{},true,{}});};
 int completed=0;queue->Enqueue(request,[&](const auto&r){++completed;CHECK_EQ(r.error,"request-budget-unavailable");});pump();
 CHECK_EQ(runs,1);CHECK_EQ(completed,1);CHECK_EQ(timers,0);CHECK_EQ(saved.log.size(),1u);CHECK_EQ(persists,2);CHECK_EQ(queue->GetStatus().waiting,0u);CHECK(!queue->CanRunImmediately());
 // Exhausted best-effort work never reserves, runs, or arms a wake-up timer.
 queue->Enqueue(request,[&](const auto&r){++completed;CHECK_EQ(r.error,"request-budget-unavailable");});pump();CHECK_EQ(runs,1);CHECK_EQ(completed,2);CHECK_EQ(timers,0);CHECK_EQ(saved.log.size(),1u);
 // Mixed work retains normal waiting semantics while removing departure work.
 Q::Request normal;normal.item="settings";normal.run=[&](auto,auto){CHECK(false);};
 queue->Enqueue(normal,[](const auto&r){CHECK(r.error.starts_with("cancelled:"));});
 queue->Enqueue(request,[&](const auto&r){++completed;CHECK_EQ(r.error,"request-budget-unavailable");});pump();CHECK_EQ(completed,3);CHECK_EQ(timers,1);CHECK_EQ(queue->GetStatus().waiting,1u);
 queue->CancelWhere([](const auto&){return true;},"test");pump();CHECK_EQ(queue->GetStatus().waiting,0u);
 // Once the existing reservation ages out, best-effort requests can run again.
 wall+=60001;mono+=60001;CHECK(queue->CanRunImmediately());request.run=[&](auto,auto done){++runs;done({"ok",false,{}});};
 queue->Enqueue(request,[&](const auto&r){CHECK(r.error.empty());CHECK(r.outcome=="ok");++completed;});pump();CHECK_EQ(runs,2);CHECK_EQ(completed,4);
 std::cout<<"immediate-only budget exhaustion, conflict retry, mixed waiting and restored availability passed\n";
}
