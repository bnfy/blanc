#include <cassert>

#include "chrome/browser/download/blanc_download_verdict_state.h"

int main() {
  using Stage = BlancDownloadVerdictState::Stage;
  using Result = safe_browsing::DownloadCheckResult;
  BlancDownloadVerdictState state;
  assert(!state.observation(Stage::kUrl).last_result);
  auto url = state.Begin(Stage::kUrl, true);
  assert(url && state.observation(Stage::kUrl).pending);
  assert(state.observation(Stage::kUrl).content_check_supported);
  state.Observe(Stage::kUrl, url, Result::UNKNOWN);
  assert(state.observation(Stage::kUrl).last_result == Result::UNKNOWN);
  assert(!state.observation(Stage::kUrl).pending);
  auto next_url = state.Begin(Stage::kUrl, false);
  assert(next_url != url && !state.observation(Stage::kUrl).last_result);
  state.Observe(Stage::kUrl, url, Result::SAFE);
  assert(!state.observation(Stage::kUrl).last_result);
  state.Observe(Stage::kUrl, next_url, Result::SAFE);
  auto content = state.Begin(Stage::kClient);
  state.Observe(Stage::kClient, content, Result::ASYNC_SCANNING);
  assert(state.observation(Stage::kClient).pending);
  state.Observe(Stage::kClient, content, Result::DEEP_SCANNED_SAFE);
  assert(!state.observation(Stage::kClient).pending);
  assert(state.observation(Stage::kUrl).last_result == Result::SAFE);
  state.InvalidateAll();
  state.Observe(Stage::kClient, content, Result::SAFE);
  assert(!state.observation(Stage::kUrl).last_result);
  assert(!state.observation(Stage::kClient).last_result);
  assert(!state.Begin(Stage::kCount));
  auto save = state.Begin(Stage::kSavePackage);
  state.Detach();
  state.Observe(Stage::kSavePackage, save, Result::SAFE);
  assert(!state.observation(Stage::kSavePackage).last_result);
  assert(!state.Begin(Stage::kUrl));
}
