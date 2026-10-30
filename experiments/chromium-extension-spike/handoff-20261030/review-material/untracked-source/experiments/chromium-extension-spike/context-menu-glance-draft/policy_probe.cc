#include "context_link_policy.h"
#include <iostream>
#include <string>

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.size() % 2) return 2;
    std::string raw;
    for (size_t i = 0; i < line.size(); i += 2) {
      auto digit = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        return -1;
      };
      int a = digit(line[i]), b = digit(line[i + 1]);
      if (a < 0 || b < 0) return 3;
      raw.push_back(static_cast<char>(a * 16 + b));
    }
    std::cout << static_cast<int>(blanc::glance::draft::ClassifyContextLink(raw)) << '\n';
  }
}
