// JSON values embedded in JavaScript must also be safe inside an HTML script.
// Escaping syntax characters here preserves the decoded data, including lists.
export function scriptLiteral(value) {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('A JSON value is required');
  const escapes = {'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'};
  return json.replace(/[<>&\u2028\u2029]/g, character => escapes[character]);
}
