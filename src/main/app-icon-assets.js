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
  paper: {
    nativeName: 'Paper',
    background: '#FFFFFF',
    foreground: '#0E0E0E',
    darkForeground: '#F4F4F4',
  },
  ink: {
    nativeName: 'Ink',
    background: '#0D0D0D',
    foreground: '#F4F4F4',
    darkForeground: '#F4F4F4',
  },
};
