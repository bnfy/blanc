// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_ANDROID_PAGES_RESOURCES_PAGES_RESOURCES_H_
#define BLANC_ANDROID_PAGES_RESOURCES_PAGES_RESOURCES_H_

#include <string_view>

#include "base/memory/ref_counted_memory.h"

// Blanc for Android's pages (blanc/android/pages.json plus the adapter),
// embedded by //blanc/island_resources/embed.py.
namespace blanc::android::pages_resources {

bool IsServed(std::string_view path);
bool IsGenerated(std::string_view path);

// The embedded bytes of a served file, or null.
scoped_refptr<base::RefCountedMemory> Find(std::string_view path);

}  // namespace blanc::android::pages_resources

#endif  // BLANC_ANDROID_PAGES_RESOURCES_PAGES_RESOURCES_H_
