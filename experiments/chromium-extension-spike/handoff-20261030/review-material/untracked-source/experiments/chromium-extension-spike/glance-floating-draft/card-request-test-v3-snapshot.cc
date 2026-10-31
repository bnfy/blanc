#include "glance_card_handler.h"

#include <cassert>
#include <utility>

using blanc::glance::draft::ParseCardRequest;

base::ListValue Message(const char* id, const char* action, base::DictValue data) {
  base::ListValue message;
  message.Append(id);
  message.Append(action);
  message.Append(std::move(data));
  return message;
}
int main() {
  base::DictValue simple;
  simple.Set("generation", 7);
  assert(ParseCardRequest(Message("1", "back", simple.Clone())));
  assert(!ParseCardRequest(Message("+1", "back", simple.Clone())));
  assert(!ParseCardRequest(Message("01", "back", simple.Clone())));
  assert(!ParseCardRequest(Message("9007199254740992", "back", simple.Clone())));
  assert(!ParseCardRequest(Message("1", "unknown", simple.Clone())));
  simple.Set("tabId", 3);
  assert(!ParseCardRequest(Message("1", "close", simple.Clone())));
  simple.Remove("tabId");
  simple.Set("generation", 1.5);
  assert(!ParseCardRequest(Message("1", "close", simple.Clone())));
  simple.Set("generation", -1);
  assert(!ParseCardRequest(Message("1", "close", simple.Clone())));
  simple.Set("generation", 7);
  simple.Set("dx", 16);
  simple.Set("dy", -16);
  auto move = ParseCardRequest(Message("2", "move", simple.Clone()));
  assert(move && move->generation == 7 && move->arguments.FindInt("dx") == 16);
  simple.Set("edge", "se");
  assert(ParseCardRequest(Message("3", "resize", simple.Clone())));
  simple.Set("edge", "elsewhere");
  assert(!ParseCardRequest(Message("3", "resize", simple.Clone())));
  simple.Set("edge", "se");
  simple.Set("dy", 1000001);
  assert(!ParseCardRequest(Message("3", "resize", simple.Clone())));
}
