#ifndef BLANC_DOWNLOADS_RECONCILE_H_
#define BLANC_DOWNLOADS_RECONCILE_H_
#include <set>
#include <vector>
// Called only on the controller's owning sequence, with a complete trusted
// browser-produced snapshot. Validation leaves the map untouched on error.
// Detach removed nodes before destroying them, so observer teardown that
// re-enters cannot invalidate an iterator while reconciliation is running.
namespace blanc::downloads_projection {
template <class Map, class Token, class Live>
bool ReconcileSnapshot(Map& handles, const std::vector<Token>& visible, Live live) {
  std::set<Token> retained;
  for (const auto& token : visible) {
    auto it = handles.find(token);
    if (it == handles.end() || !retained.insert(token).second || !live(it->second))
      return false;
  }
  std::vector<typename Map::node_type> detached;
  for (auto it = handles.begin(); it != handles.end();) {
    if (!retained.contains(it->first)) {
      auto remove = it++;
      detached.push_back(handles.extract(remove));
    } else {
      ++it;
    }
  }
  // Detached entries are destroyed only after the map traversal is complete.
  return true;
}
}  // namespace blanc::downloads_projection
#endif
