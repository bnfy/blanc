#include "launch_sunrise_gate.h"

#include <cstdint>
#include <iostream>
#include <map>

int main() {
  int scenario;
  while (std::cin >> scenario) {
    int count;
    int64_t start;
    if (!(std::cin >> start >> count) || count < 0 || count > 100) return 2;
    LaunchSunriseGate gate(start);
    std::map<int, LaunchSunriseContentsAttempt> pages;
    for (int i = 0; i < count; ++i) {
      int page, enabled, is_private, visible;
      int64_t now;
      if (!(std::cin >> page >> now >> enabled >> is_private >> visible)) return 2;
      std::cout << (pages[page].Take(gate, now, enabled, is_private, visible) ? '1' : '0');
    }
    std::cout << '\n';
  }
  return 0;
}
