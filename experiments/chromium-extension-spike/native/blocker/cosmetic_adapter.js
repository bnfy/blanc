// Runs inside the authenticated, sandboxed engine closure. No DOM or Node APIs.
globalThis.blancCosmetics = input => {
  const args = JSON.parse(input);
  const result = engine.getCosmeticsFilters({
    ...args,
    getBaseRules: args.initial,
    getInjectionRules: args.initial,
    getExtendedRules: false,
    getRulesFromHostname: args.initial,
    getRulesFromDOM: true,
  });
  return JSON.stringify({styles: result.styles, scripts: result.scripts});
};
