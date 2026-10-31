#include "glance_modal_position.h"

#include <cassert>
#include <climits>

using blanc::glance::draft::ModalPosition;
int main() {
  // Center over a normal floating page, then keep dialogs inside the window
  // when the card is near its edges or the dialog is taller than the space.
  auto normal = ModalPosition({200, 140, 600, 400}, {0, 50, 1000, 700}, {300, 200});
  assert(normal && normal->x == 350 && normal->y == 140);
  auto edge = ModalPosition({850, 650, 140, 100}, {0, 50, 1000, 700}, {300, 200});
  assert(edge && edge->x == 700 && edge->y == 550);
  auto oversize = ModalPosition({100, 150, 300, 250}, {50, 100, 500, 300}, {700, 600});
  assert(oversize && oversize->x == 50 && oversize->y == 100);
  auto negative = ModalPosition({-600, -300, 300, 250}, {-800, -400, 600, 500}, {200, 100});
  assert(negative && negative->x == -550 && negative->y == -300);
  assert(!ModalPosition({0, 0, 0, 100}, {0, 0, 100, 100}, {20, 20}));
  assert(!ModalPosition({0, 0, 100, 100}, {0, 0, 100, 100}, {-1, 20}));
  assert(!ModalPosition({INT_MAX, 0, 100, 100}, {0, 0, 100, 100}, {20, 20}));
}
