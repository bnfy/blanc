#include "glance_geometry.h"
#include <iomanip>
#include <iostream>
#include <string>
using namespace blanc::glance::draft;
void Print(Rect r) { std::cout << '[' << r.x << ',' << r.y << ',' << r.width << ',' << r.height << ']'; }
int main() {
  std::cout << std::setprecision(17);
  std::string op;
  Rect area{}, frame{};
  double dx, dy;
  std::string edge;
  while (std::cin >> op >> area.x >> area.y >> area.width >> area.height >>
         frame.x >> frame.y >> frame.width >> frame.height >> dx >> dy >> edge) {
    if (op == "default") Print(DefaultFrame(area));
    else if (op == "clamp") Print(ClampFrame(frame, area));
    else if (op == "fractions") Print(FrameToFractions(frame, area));
    else if (op == "restore") Print(FractionsToFrame(frame, area));
    else if (op == "move") Print(MoveFrame(frame, dx, dy, area));
    else if (op == "resize") Print(ResizeFrame(frame, edge, dx, dy, area));
    else if (op == "geometry") {
      auto g = Geometry(frame, area);
      std::cout << '['; Print(g.chrome); std::cout << ','; Print(g.frame);
      std::cout << ','; Print(g.header); std::cout << ','; Print(g.page); std::cout << ']';
    } else return 2;
    std::cout << '\n';
  }
}
