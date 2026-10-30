#ifndef BLANC_SUNRISE_FOREGROUND_MEMBERSHIP_H_
#define BLANC_SUNRISE_FOREGROUND_MEMBERSHIP_H_

// Chromium's active tab or a valid member of its active native split. The
// prototype models Glance as a native split; inconsistent state fails closed.
// The caller must also validate the actual document, view and widget state.
template <typename Model, typename Contents>
bool SunriseForegroundMember(Model* model, const Contents* contents) {
  if (!model || !contents) return false;
  const int index = model->GetIndexOfWebContents(contents);
  const int active = model->active_index();
  if (index < 0 || active < 0 || !model->ContainsIndex(index) ||
      !model->ContainsIndex(active)) return false;
  const auto active_split = model->GetSplitForTab(active);
  if (active_split && !model->ContainsSplit(*active_split)) return false;
  if (index == active) return true;
  const auto target_split = model->GetSplitForTab(index);
  return target_split && active_split && target_split == active_split;
}

#endif
