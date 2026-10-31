#include "bang_write_gate.h"

#include <atomic>
#include <cassert>
#include <thread>
#include <vector>

int main() {
  using blanc::bangs::draft::BangWriteGate;
  BangWriteGate<std::string> gate;
  assert(!gate.Acquire(""));
  auto first = gate.Acquire("profile-a");
  assert(first && !gate.Acquire("profile-a"));
  auto second = gate.Acquire("profile-b");
  assert(second);
  auto callback = first;
  first.reset();
  assert(!gate.Acquire("profile-a"));
  callback.reset();
  assert(gate.Acquire("profile-a"));
  second.reset();

  std::atomic<int> inside{0};
  std::atomic<int> collisions{0};
  std::vector<std::thread> threads;
  for (int i = 0; i < 4; ++i) {
    threads.emplace_back([&] {
      for (int j = 0; j < 10000; ++j) {
        auto lease = gate.Acquire("shared");
        if (!lease)
          continue;
        if (inside.fetch_add(1) != 0)
          ++collisions;
        std::this_thread::yield();
        --inside;
      }
    });
  }
  for (auto& thread : threads)
    thread.join();
  assert(collisions == 0 && inside == 0);
  assert(gate.Acquire("shared"));
}
