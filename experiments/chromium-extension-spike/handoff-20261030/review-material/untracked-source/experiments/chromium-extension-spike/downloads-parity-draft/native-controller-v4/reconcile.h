#ifndef BLANC_DOWNLOADS_RECONCILE_H_
#define BLANC_DOWNLOADS_RECONCILE_H_
#include <set>
#include <vector>
// Called only on the controller's owning sequence, with a complete trusted
// browser-produced snapshot. Validation is atomic with respect to this map;
// invalid snapshots leave it untouched. No callback may re-enter the map.
namespace blanc::downloads_projection {
template <class Map, class Token, class Live>
bool ReconcileSnapshot(Map& handles, const std::vector<Token>& visible, Live live) {
  std::set<Token> retained;
  for (const auto& token : visible) {
    auto it = handles.find(token);
    if (it == handles.end() || !retained.insert(token).second || !live(it->second))
      return false;
  }
  for (auto it = handles.begin(); it != handles.end();) {
    if (!retained.contains(it->first)) it = handles.erase(it);
    else ++it;
  }
  return true;
}
}  // namespace blanc::downloads_projection
#endif
