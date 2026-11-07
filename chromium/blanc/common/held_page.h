// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_COMMON_HELD_PAGE_H_
#define BLANC_COMMON_HELD_PAGE_H_

namespace blanc {

// Marks a page set aside in a Space (F41), as WebContents user data, so code
// outside the browser UI can refuse what a page no one can see may not do.
inline constexpr char kHeldPageKey[] = "blanc.held.page";

}  // namespace blanc

#endif  // BLANC_COMMON_HELD_PAGE_H_
