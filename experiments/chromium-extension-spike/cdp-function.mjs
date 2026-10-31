// Test harness helper: executable code is a function supplied by the harness;
// values cross the CDP protocol as arguments, never as JavaScript source.
export async function callFunction(client, fn, args = [], userGesture = false) {
  const root = await client.send('Runtime.evaluate', { expression: 'globalThis', returnByValue: false });
  const objectId = root.result?.objectId;
  if (!objectId) throw new Error('Missing CDP global object');
  try {
    const result = await client.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: fn.toString(),
      arguments: args.map(value => ({ value })),
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  } finally {
    await client.send('Runtime.releaseObject', { objectId });
  }
}
