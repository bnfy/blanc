'use strict';

const fs = require('node:fs');

// What a file another process still holds open looks like to a recursive
// delete: Windows reports EBUSY or EPERM for the file, then ENOTEMPTY for its
// directory. Chromium's child processes can outlive Blanc's main process for
// a moment and keep a cache journal open (document-policy smoke, Windows,
// October 2026).
const LINGERING_LOCKS = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

/**
 * Remove a smoke's temporary profile directory once Blanc has exited. Node
 * retries a locked file with a growing delay (about 11 s in all here); a file
 * still held after that is left behind with a note rather than failing a run
 * whose checks passed, since the runner discards its temporary directory.
 * Any other error is returned for the caller to report.
 *
 * @returns {Error|null}
 */
function removeTempProfile(root, { rm = fs.rmSync, log = console.error } = {}) {
  try {
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    return null;
  } catch (error) {
    if (!LINGERING_LOCKS.has(error?.code)) return error;
    log(`left ${root} behind: ${error.code} (a file was still open after Blanc exited)`);
    return null;
  }
}

module.exports = { removeTempProfile, LINGERING_LOCKS };
