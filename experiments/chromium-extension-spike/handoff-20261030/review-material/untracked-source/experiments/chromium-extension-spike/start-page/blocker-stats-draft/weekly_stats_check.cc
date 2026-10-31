#include "weekly_stats.h"

#include <fcntl.h>
#include <cmath>
#include <iostream>
#include <limits>
#include <memory>
#include <string>

#include "base/at_exit.h"
#include "base/command_line.h"
#include "base/i18n/icu_util.h"
#include "base/files/memory_mapped_file.h"
#include "base/task/single_thread_task_executor.h"

struct Vector { const char* zone; double now; double week; int index; };
const Vector vectors[] = {
#include "calendar-vectors.inc"
};
int main(int argc, char** argv) {
  auto at_exit = std::make_unique<base::AtExitManager>();
  base::CommandLine::Init(argc, argv);
  if (argc != 2) { std::cerr << "Pass the existing Chromium icudtl.dat path\n"; return 2; }
  int fd = open(argv[1], O_RDONLY);
  if (fd < 0 || !base::i18n::InitializeICUWithFileDescriptor(
                    fd, base::MemoryMappedFile::Region::kWholeFile)) return 2;
  auto executor = std::make_unique<base::SingleThreadTaskExecutor>();
  using namespace blanc::blocker_stats;
  int failed = 0;
  auto check = [&](bool ok, const char* name) { if (!ok) { ++failed; std::cerr << "FAIL " << name << '\n'; } };
  for (size_t i=0; i<std::size(vectors); ++i) {
    const auto& v=vectors[i]; std::string z(v.zone);
    auto actual=LocalCalendarPosition(v.now, std::u16string(z.begin(),z.end()));
    if (!actual || actual->week_start_ms!=v.week || actual->day_index!=v.index) {
      if (failed < 20) std::cerr << "FAIL vector=" << i << " zone=" << v.zone << " now=" << v.now << " expected=" << v.week << "/" << v.index << " actual=" << (actual ? actual->week_start_ms : -1) << "/" << (actual ? actual->day_index : -1) << '\n';
      ++failed;
    }
  }
  std::cerr << "calendar vectors finished\n";
  State legacy{.week_start_ms=42, .blocked=17, .days={1,2}};
  Normalize(legacy);check(*legacy.blocked==17 && legacy.days==std::vector<double>(7,0),"legacy");
  State malformed{.week_start_ms=42, .blocked=-1, .days={0,0,-1,0,0,0,0}};
  Normalize(malformed);check(*malformed.blocked==0 && malformed.days==std::vector<double>(7,0),"normalize");
  State fractional{.week_start_ms=42, .blocked=1.5, .days={0,0,0,0,0,0,0.5}};
  Normalize(fractional);check(*fractional.blocked==0 && fractional.days==std::vector<double>(7,0),"fractional invalid");
  State missing{.week_start_ms=42};
  Normalize(missing);check(*missing.blocked==0 && missing.days==std::vector<double>(7,0),"missing fields");
  State infinite{.week_start_ms=42,.blocked=std::numeric_limits<double>::infinity(),
                 .days={0,0,0,0,0,0,std::numeric_limits<double>::quiet_NaN()}};
  Normalize(infinite);check(*infinite.blocked==0 && infinite.days==std::vector<double>(7,0),"nonfinite invalid");
  std::cerr << "normalization finished\n";
  const auto ny=std::u16string(u"America/New_York");
  State state{.week_start_ms=0,.blocked=0,.days=std::vector<double>(7,0)};
  check(Record(state, 1792965600000.0, ny),"sunday record");
  check(state.blocked==1 && state.days[6]==1,"sunday bucket");
  check(Record(state, 1792987200000.0, ny),"monday record");
  check(state.blocked==1 && state.days[0]==1 && state.days[6]==0,"monday roll");
  state.days={2,1,0,0,0,0,0};check(BarHeights(state)==std::array<int,7>{100,50,0,0,0,0,0},"bars");
  state.days={8,1,0,0,0,0,0};check(BarHeights(state)==std::array<int,7>{100,13,0,0,0,0,0},"rounding");
  State travel{.week_start_ms=0,.blocked=0,.days=std::vector<double>(7,0)};
  check(Record(travel,1792987200000.0,u"UTC"),"travel first record");
  check(Roll(travel,1792987200000.0,ny),"travel zone roll");
  check(travel.blocked==0 && travel.days==std::vector<double>(7,0),"zone change resets");
  auto before=state;check(!Record(state,std::numeric_limits<double>::quiet_NaN(),ny),"invalid time denied");
  check(state.week_start_ms==before.week_start_ms && state.blocked==before.blocked && state.days==before.days,"invalid time unchanged");
  std::cerr << "roll and invalid time finished\n";
  check(!LocalCalendarPosition(0,u"Invalid/Not_Zone"),"unknown timezone denied");
  std::cerr << "unknown timezone check finished\n";
  std::cout << "calendar-vectors=" << std::size(vectors) << " plus reducer checks failures=" << failed << '\n';
  std::cerr << "result output finished\n";
  executor.reset();
  std::cerr << "executor teardown finished\n";
  at_exit.reset();
  std::cerr << "AtExit teardown finished\n";
  return failed ? 1 : 0;
}
