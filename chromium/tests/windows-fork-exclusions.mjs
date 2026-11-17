// Explicit platform/construction exclusions for the Windows build, each
// approved like the Mac's (macos-fork-exclusions.mjs). Never use this for
// missing features: a case Windows can't pass yet stays a recorded failure.
// Empty until the first Windows run gives evidence for an entry.
export const windowsForkExclusions = Object.freeze({});
