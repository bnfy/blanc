// Pure derivation for the island's shield chip and its site-protection
// popover (design: docs/superpowers/specs/2026-08-07-shield-popover-design.md).
// Main computes these and ships them on tabs:updated; the chrome renderers
// only render. An excepted site outranks the global switch here for the same
// reason it does in resolveBlockAdsCommand: the exception is what the user
// can see and undo from this site.

const { blockableHostname } = require('./adblock-exceptions');

function countPhrase(blocked) {
  return `${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads & trackers'}`;
}

function shieldChipState({ url, blockedCount, excepted, adblockEnabled }) {
  if (!blockableHostname(url)) return { mode: 'hidden', count: 0, title: '' };
  if (excepted) {
    return { mode: 'off', count: 0, title: 'Ads allowed on this site — click for site controls' };
  }
  if (!adblockEnabled) {
    return { mode: 'off', count: 0, title: 'Ad blocking is off — click for details' };
  }
  const blocked = blockedCount ?? 0;
  if (blocked > 0) {
    return {
      mode: 'count',
      count: blocked,
      title: `Blanc blocked ${countPhrase(blocked)} on this page — click for site controls`,
    };
  }
  return { mode: 'quiet', count: 0, title: 'Protected — click for site controls' };
}

function shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled }) {
  const host = blockableHostname(url);
  if (!host) return null;
  if (excepted) {
    return { variant: 'site', host, on: false, countLine: 'Ads allowed on this site' };
  }
  if (!adblockEnabled) {
    return { variant: 'global-off', host, on: false, countLine: 'Ad blocking is off everywhere' };
  }
  const blocked = blockedCount ?? 0;
  const countLine = blocked === 0
    ? 'Nothing blocked on this page yet'
    : `${countPhrase(blocked)} blocked on this page`;
  return { variant: 'site', host, on: true, countLine };
}

module.exports = { shieldChipState, shieldPopoverModel };
