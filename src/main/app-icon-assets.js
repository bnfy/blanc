// Native Icon Composer asset names and source colors for every Dock colorway.
// `scripts/after-pack-app-icons.js` compiles these into one Assets.car; the
// runtime selects the named icon stack without flattening it, so macOS remains
// free to render Default, Dark, Clear, or Tinted (including the user's tint).
// Keep ids aligned with settings.js APP_ICON_LABELS.
module.exports = {
  sunrise: {
    nativeName: 'Icon',
    background: '#F7F0E5',
    darkBackground: '#1C1A16',
    imageName: 'sunrise-mark.png',
    preserveColor: true,
    layerName: 'Sunrise',
  },
  'sunrise-dark': {
    nativeName: 'SunriseDark',
    background: '#1C1A16',
    darkBackground: '#1C1A16',
    imageName: 'sunrise-mark.png',
    preserveColor: true,
    layerName: 'Sunrise',
  },
  // Fixed in every appearance: a cream glass mark over a gold image layer.
  // The gold cannot be the fill, which Icon Composer darkens itself in Dark.
  // Its layers live in build/app-icons/colorways (npm run brand:build).
  'sunrise-gold': {
    nativeName: 'SunriseGold',
    background: '#CFA65C',
    imageDir: 'build/app-icons/colorways',
    imageName: 'sunrise-mark-cream.png',
    glass: true,
    tileImageName: 'gold-tile.png',
    shadowOpacity: 0.3,
    preserveColor: true,
    layerName: 'Sunrise',
  },
};
