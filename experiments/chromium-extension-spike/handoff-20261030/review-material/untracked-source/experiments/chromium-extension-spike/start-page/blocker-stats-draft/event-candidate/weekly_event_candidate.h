#ifndef BLANC_BLOCKER_STATS_EVENT_CANDIDATE_H_
#define BLANC_BLOCKER_STATS_EVENT_CANDIDATE_H_
#include "base/memory/weak_ptr.h"
namespace content { class BrowserContext; }
namespace blanc::blocker_stats {
// Review-only: posts an event with no URL, request identity or tab data.
// No coverage is attested, so this candidate cannot persist or expose counts.
void PostCandidateRuleBlock(base::WeakPtr<content::BrowserContext> context);
}  // namespace blanc::blocker_stats
#endif
