// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_ISLAND_PERMISSION_PROMPT_H_
#define BLANC_BROWSER_UI_ISLAND_PERMISSION_PROMPT_H_

#include <memory>

#include "components/permissions/permission_prompt.h"

namespace content { class WebContents; }

namespace blanc_prototype {

// Shipping's permission prompt (F13) for a tab in an Island window, drawn by
// the Island host; null elsewhere, which leaves Chromium's own prompt
// (CreatePermissionPrompt, patch 0015).
std::unique_ptr<permissions::PermissionPrompt> CreateIslandPermissionPrompt(
    content::WebContents* contents, permissions::PermissionPrompt::Delegate* delegate);

// The Island host's Allow (true) or Block (false) for prompt |id|; false when
// that prompt is no longer open.
bool AnswerPermissionPrompt(int id, bool allow);

}  // namespace blanc_prototype

#endif  // BLANC_BROWSER_UI_ISLAND_PERMISSION_PROMPT_H_
