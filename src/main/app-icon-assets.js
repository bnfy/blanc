// Native Icon Composer asset names and source colors for every Dock colorway.
// `scripts/after-pack-app-icons.js` compiles these into one Assets.car. A
// named stack handed to the Dock follows Light and Dark by itself; Clear and
// Tinted restyle only the bundle icon, so app-icon.js shows that in those
// styles (verified in the live Dock, 2026-10-19).
// Keep ids aligned with settings.js APP_ICON_LABELS.
module.exports = {
  sunrise: {
    nativeName: 'Icon',
    background: '#F7F0E5',
    darkBackground: '#1C1A16',
    imageName: 'sunrise-mark.png',
    darkFlatIcon: 'sunrise-dark',
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
  // Soft gold in Light, polished gold in Dark: a cream glass mark over gold
  // image layers. The gold cannot be the fill, which Icon Composer darkens
  // itself in Dark, so each appearance gets its own tile layer instead.
  // Its layers live in build/app-icons/colorways (npm run brand:build).
  'sunrise-gold': {
    nativeName: 'SunriseGold',
    background: '#CFA65C',
    imageDir: 'build/app-icons/colorways',
    imageName: 'sunrise-mark-cream.png',
    glass: true,
    specular: true,
    lighting: 'individual',
    shadow: { kind: 'layer-color', opacity: 0.6 },
    translucency: { enabled: true, value: 0.25 },
    tileImageName: 'gold-tile.png',
    darkTileImageName: 'gold-tile-dark.png',
    darkFlatIcon: 'sunrise-gold-dark',
    preserveColor: true,
    layerName: 'Sunrise',
  },
  // Sunrise Spectrum and Sunrise Amber: the Sunrise redrawn as a ring sun,
  // seven rays and six water lines, each part a colored glass layer over a
  // white rim, with a near-black tile in Dark. Spectrum is coral over blue on
  // the graded gray Arc's icon sits on in the Dock; Amber is gold over bronze
  // on a warm cream fill. Their layers live in build/app-icons/colorways
  // (npm run brand:build).
  // Spectrum's tile is Arc's graded gray, too much for a one-color fill, so
  // it is drawn as tile images (a near-black one in Dark), like Gold's.
  'sunrise-spectrum': colorwayDefinition('SunriseSpectrum', 'spectrum', '#C3C9D2', '#3A3942', {
    tileImageName: 'spectrum-tile.png',
    darkTileImageName: 'spectrum-tile-dark.png',
  }),
  'sunrise-amber': colorwayDefinition('SunriseAmber', 'amber', '#FFF7EC', '#2E261C'),
};

function colorwayDefinition(nativeName, prefix, background, darkBackground, tiles = {}) {
  return {
    ...tiles,
    nativeName,
    background,
    darkBackground,
    imageDir: 'build/app-icons/colorways',
    imageName: `${prefix}-sun.png`,
    layerName: 'Sun',
    extraLayers: [
      { imageName: `${prefix}-rays.png`, layerName: 'Rays' },
      { imageName: `${prefix}-water.png`, layerName: 'Water' },
    ],
    rimImageName: `${prefix}-rim.png`,
    glass: true,
    specular: true,
    lighting: 'individual',
    shadow: { kind: 'layer-color', opacity: 0.5 },
    translucency: { enabled: true, value: 0.15 },
    darkFlatIcon: `sunrise-${prefix}-dark`,
    preserveColor: true,
  };
}
