// electron-builder custom macOS signer. Its global entitlementsInherit option
// otherwise replaces @electron/osx-sign's helper-specific defaults, which
// would either leave Electron Helper (Plugin) unable to load 1Password's
// separately signed SDK bridge or weaken every helper. Override exactly that
// one bundle and delegate the complete signing walk back to osx-sign.
const path = require('node:path');
const { signAsync } = require('@electron/osx-sign');

const PLUGIN_HELPER_MARKER = '(Plugin).app';

function withPluginEntitlements(options, root = path.join(__dirname, '..')) {
  const inheritedOptionsForFile = options.optionsForFile;
  const pluginEntitlements = path.join(root, 'build', 'entitlements.mac.plugin.plist');
  return {
    ...options,
    optionsForFile(filePath) {
      const inherited = inheritedOptionsForFile?.(filePath) ?? {};
      if (!String(filePath).includes(PLUGIN_HELPER_MARKER)) return inherited;
      return { ...inherited, entitlements: pluginEntitlements };
    },
  };
}

module.exports = async function signMac(options) {
  await signAsync(withPluginEntitlements(options));
};

module.exports.withPluginEntitlements = withPluginEntitlements;
module.exports.PLUGIN_HELPER_MARKER = PLUGIN_HELPER_MARKER;
