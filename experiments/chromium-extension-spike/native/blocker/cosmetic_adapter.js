// Runs inside the authenticated, sandboxed engine closure. No DOM or Node APIs.
globalThis.blancCosmetics = input => {
  const args = JSON.parse(input);
  const result = engine.getCosmeticsFilters({
    ...args,
    getBaseRules: args.initial,
    getInjectionRules: args.initial,
    getExtendedRules: args.initial,
    getRulesFromHostname: args.initial,
    getRulesFromDOM: true,
  });
  // Keep helper declarations private while retaining Ghostery's shared cache.
  // Matches the production wrapper in src/main/adblock-scriptlets.js.
  const scripts = result.scripts.map(script =>
    `((scriptletGlobals) => {\n${script}\n})(typeof globalThis.scriptletGlobals === 'undefined' ? (globalThis.scriptletGlobals = {}) : globalThis.scriptletGlobals);`);
  return JSON.stringify({styles: result.styles, scripts, extended: args.initial ? result.extended.map(rule => ({...rule, properties: procedural.properties.filter(property => JSON.stringify(rule.ast).includes(property.attribute))})) : []});
};
