'use strict';

// Pure policy, no require('electron') — same rule as tab-sleep.js, so the
// validator is unit-testable without booting an app.
//
// This deliberately duplicates the length/whitespace logic in the renderer's
// type-to-open.js. The renderer check keeps the panel from opening on a
// keystroke that isn't text; this one is the trust boundary. A renderer is
// never trusted to have run its own check.

// \p{C} is Unicode's "other" category — control (Cc), format (Cf), surrogate
// (Cs), private-use (Co), unassigned (Cn). None of them are a character
// someone means to search for, and NUL is not whitespace, so trim() alone
// would let it through and the "printable" contract would be a lie.
const NON_PRINTABLE = /\p{C}/u;

/**
 * A prefill character must be exactly one printable, non-whitespace code
 * point. Code points rather than UTF-16 units, so a single astral character
 * (an emoji from a picker) is one character and not a length-2 string.
 *
 * Stricter than the renderer's gate on purpose. The renderer only ever sees
 * a real `event.key`, which is never a raw control character; this is the
 * trust boundary, where the payload is whatever a renderer chose to send.
 * @param {unknown} char
 * @returns {boolean}
 */
function isValidPrefillChar(char) {
  return typeof char === 'string'
    && [...char].length === 1
    && char.trim() !== ''
    && !NON_PRINTABLE.test(char);
}

module.exports = { isValidPrefillChar };
