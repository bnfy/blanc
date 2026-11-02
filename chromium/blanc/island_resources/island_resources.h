// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_ISLAND_RESOURCES_ISLAND_RESOURCES_H_
#define BLANC_ISLAND_RESOURCES_ISLAND_RESOURCES_H_

#include <string_view>

#include "base/memory/ref_counted_memory.h"

namespace blanc::island_resources {

// Whether `path` is one of the Island assets the browser serves
// (served.txt); the only paths either serving mode may answer.
bool IsServed(std::string_view path);

// Whether `path` is a build output (such as the compiled Mojo bindings) rather
// than a canonical file; a development asset folder never shadows these.
bool IsGenerated(std::string_view path);

// The embedded bytes of a served Island asset, or null.
scoped_refptr<base::RefCountedMemory> Find(std::string_view path);

}  // namespace blanc::island_resources

#endif  // BLANC_ISLAND_RESOURCES_ISLAND_RESOURCES_H_
