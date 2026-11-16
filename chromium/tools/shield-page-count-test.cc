// Compiled and run by shield-page-count.test.mjs: blanc/ has no C++ test target.
#include <cstdio>
#include <cstdlib>

#include "blanc/services/blocker/shield_page_count.h"

#define EXPECT(condition)                                          \
  do {                                                             \
    if (!(condition)) {                                            \
      std::printf("line %d: %s\n", __LINE__, #condition);          \
      std::exit(1);                                                \
    }                                                              \
  } while (0)

using blanc::ShieldPageCount;

int main() {
  {  // The race: a block before the browser has processed the commit.
    ShieldPageCount count;
    count.BeginCommit(7);
    EXPECT(count.Record(7));
    EXPECT(count.value() == 0);
    count.PageChanged();
    count.Committed(7, 7);
    EXPECT(count.value() == 1);
  }
  {  // After the commit, the same page's requests count at once.
    ShieldPageCount count;
    count.BeginCommit(7);
    count.PageChanged();
    count.Committed(7, 7);
    EXPECT(count.Record(7));
    EXPECT(count.value() == 1);
  }
  {  // A late block from the page before is never charged to the new one.
    ShieldPageCount count;
    count.BeginCommit(7);
    count.PageChanged();
    count.Committed(7, 7);
    count.BeginCommit(8);
    count.PageChanged();
    count.Committed(8, 8);
    EXPECT(!count.Record(7));
    EXPECT(count.value() == 0);
  }
  {  // A commit that never lands leaves the page on show its count.
    ShieldPageCount count;
    EXPECT(count.Record(ShieldPageCount::kShownPage));
    count.BeginCommit(7);
    EXPECT(count.Record(7));
    count.Abandoned(7);
    EXPECT(count.value() == 1);
    EXPECT(!count.Record(7));
  }
  {  // Back to a cached page: it keeps its own factory, so its tag counts again.
    ShieldPageCount count;
    count.BeginCommit(7);
    count.PageChanged();
    count.Committed(7, 7);
    count.BeginCommit(8);
    count.PageChanged();
    count.Committed(8, 8);
    count.PageChanged();
    count.Committed(9, 7);
    EXPECT(count.value() == 0);
    EXPECT(count.Record(7));
    EXPECT(count.value() == 1);
    EXPECT(!count.Record(8));
  }
  {  // Two commits under way: each page gets its own blocks and keeps its tag.
    ShieldPageCount count;
    count.BeginCommit(7);
    EXPECT(count.Record(7));
    count.BeginCommit(8);
    EXPECT(count.Record(8));
    EXPECT(count.Record(8));
    count.PageChanged();
    count.Committed(7, 7);
    EXPECT(count.value() == 1);
    count.PageChanged();
    count.Committed(8, 8);
    EXPECT(count.value() == 2);
    EXPECT(count.Record(8));
    EXPECT(count.value() == 3);
  }
  {  // The old renderer dying mid-commit doesn't touch the page on its way in.
    ShieldPageCount count;
    EXPECT(count.Record(ShieldPageCount::kShownPage));
    count.BeginCommit(7);
    EXPECT(count.Record(7));
    count.Reset();
    EXPECT(count.value() == 0);
    count.PageChanged();
    count.Committed(7, 7);
    EXPECT(count.value() == 1);
    EXPECT(count.Record(7));
    EXPECT(count.value() == 2);
  }
  std::puts("ok");
  return 0;
}
