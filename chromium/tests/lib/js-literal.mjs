// A value as a JavaScript literal for code the harness evaluates in the test
// browser. JSON.stringify alone leaves `<`, `>`, `/` and the line separators
// U+2028/U+2029 as they are; escaping them keeps a value from ever ending a
// script context or being read as anything but data.
export function jsLiteral(value) {
 const json = JSON.stringify(value);
 if (json === undefined) return 'undefined';
 return json.replace(/[<>/\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
