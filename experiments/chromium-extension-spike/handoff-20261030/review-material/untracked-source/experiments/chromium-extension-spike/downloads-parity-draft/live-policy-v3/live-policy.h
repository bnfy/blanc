#ifndef BLANC_DOWNLOADS_LIVE_POLICY_H_
#define BLANC_DOWNLOADS_LIVE_POLICY_H_
#include "policy-core.h"
class Profile;
namespace download { class DownloadItem; }
namespace blanc::downloads_projection {
// Caller supplies the manager-proven exact context and a currently live item
// on the UI sequence. Re-evaluate after all document/owner checks immediately
// before each action. A null/mismatched item context is denied, not borrowed
// from another profile. This is an unregistered draft, not an auth boundary.
LivePolicy ReadLivePolicy(Profile* exact_context, download::DownloadItem* item);
}
#endif
