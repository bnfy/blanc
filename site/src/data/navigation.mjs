// Primary website navigation. Detailed answers live in Support and Trust.
// The Browser menu comes first: a click-to-open panel (never on hover; the
// October 2026 header replaced hover menus) with Download and Features
// columns. Without scripting its trigger is a plain link to /features.
export const browserMenu = {
  href: '/features',
  key: 'features',
  label: 'Browser',
  downloads: [
    { href: '/download#download-options', label: 'macOS' },
    { href: '/download#dl-win', label: 'Windows' },
    { href: '/download#dl-linux', label: 'Linux' },
  ],
  features: [
    { href: '/features/island', label: 'The Island' },
    { href: '/features/workspaces', label: 'Blanc Spaces' },
    { href: '/features/tab-groups', label: 'Tab groups' },
    { href: '/features/ad-blocking', label: 'Ad and tracker blocking' },
    { href: '/features/private-tabs', label: 'Private tabs' },
    { href: '/features/glance', label: 'Glance' },
    { href: '/features/start-page', label: 'Start Page' },
  ],
  more: [
    { href: '/features', label: 'All features' },
    { href: '/#compare', label: 'Blanc vs. Chrome' },
  ],
};

export const directLinks = [
  { href: '/trust', key: 'privacy', label: 'Privacy & Security' },
  { href: '/patron', key: 'patron', label: 'Patron' },
  { href: '/about', key: 'about', label: 'About' },
  { href: '/support', key: 'support', label: 'Support' },
  { href: '/mail', key: 'mail', label: 'Mail' },
];

// Page path without extension or trailing slash. The build emits the homepage
// as /index.html (build.format: 'file'), so /index is the homepage too.
export const pagePath = pathname =>
  pathname.replace(/\.html$/, '').replace(/\/(index)?$/, '') || '/';
