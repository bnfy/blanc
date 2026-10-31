#include "visibility-policy.h"
#include <cassert>

struct Value { bool blank = false; bool empty() const { return blank; } bool is_empty() const { return blank; } };
struct FakeItem {
  bool temporary = false, transient = false;
  Value filename, target, url;
  int insecure = 1;
  bool IsTemporary() const { return temporary; }
  bool IsTransient() const { return transient; }
  Value GetFileNameToReportUser() const { return filename; }
  Value GetTargetFilePath() const { return target; }
  Value GetURL() const { return url; }
  int GetInsecureDownloadStatus() const { return insecure; }
};

int main() {
  using blanc::downloads_projection::VisibleInNativeDownloads;
  FakeItem item;
  bool trusted = false, visible = true;
  int calls = 0;
  auto is_trusted = [&](const FakeItem&) { ++calls; return trusted; };
  auto show = [&](const FakeItem&) { ++calls; return visible; };
  auto test = [&] { return VisibleInNativeDownloads(item, 5, is_trusted, show); };
  assert(test());
  item.temporary = true; calls = 0; assert(!test() && calls == 0); item.temporary = false;
  item.transient = true; calls = 0; assert(!test() && calls == 0); item.transient = false;
  item.filename.blank = true; calls = 0; assert(!test() && calls == 0); item.filename.blank = false;
  item.target.blank = true; calls = 0; assert(!test() && calls == 0); item.target.blank = false;
  item.url.blank = true; calls = 0; assert(!test() && calls == 0); item.url.blank = false;
  item.insecure = 5; calls = 0; assert(!test() && calls == 0); item.insecure = 1;
  trusted = true; calls = 0; assert(!test() && calls == 1); trusted = false;
  visible = false; calls = 0; assert(!test() && calls == 2); visible = true;
  assert(test());
}
