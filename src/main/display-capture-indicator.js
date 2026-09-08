'use strict';

function projectDisplayShares(shares, { tabIds, capturingOnly } = {}) {
  if (capturingOnly && (!shares || shares.length === 0)) return [];
  const allowed = tabIds ? new Set(tabIds) : null;
  return (shares || [])
    .filter((row) => !allowed || allowed.has(row.tabId))
    .map((row) => ({
      shareId: row.shareId,
      pending: row.pending === true,
      origin: row.origin ?? null,
      surfaceLabel: row.surfaceLabel ?? null,
      surfaceKind: row.surfaceKind ?? null,
      computerAudio: row.computerAudio === true,
      tabId: row.tabId ?? null,
    }));
}

module.exports = { projectDisplayShares };
