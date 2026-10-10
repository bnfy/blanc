'use strict';
// The interface translator for English, built from the generated catalog the
// app ships. Tests of modules that take `t` pass this one.
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const { messages } = require('../../src/renderer/pages/strings.en.js');

module.exports = { englishT: createTranslator({ locale: 'en', messages }) };
