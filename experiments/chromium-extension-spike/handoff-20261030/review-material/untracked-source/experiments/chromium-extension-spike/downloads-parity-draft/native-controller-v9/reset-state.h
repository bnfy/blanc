#ifndef BLANC_DOWNLOADS_RESET_STATE_H_
#define BLANC_DOWNLOADS_RESET_STATE_H_
namespace blanc::downloads_projection {
// Sequence-confined; no external callbacks in epoch assignment or gate reset.
// Revoke the old epoch and detach every handle before destroying any observer.
// Reentrant observer teardown sees the new epoch and a separate empty map.
template <class Epoch, class Gate, class Map>
void ResetSnapshotState(Epoch& epoch, Gate& gate, Map& handles, const Epoch& next) {
  epoch = next;
  gate.Reset(next);
  Map detached;
  handles.swap(detached);
  // Detached observer destruction occurs after revocation and swap. Nothing
  // that accesses the original state may follow the end of this helper.
}
}  // namespace blanc::downloads_projection
#endif
