// Primary website navigation. Detailed answers live in Support and Trust.
export const directLinks = [
  { href: '/features', key: 'features', label: 'Features' },
  { href: '/trust', key: 'privacy', label: 'Privacy & Security' },
  { href: '/#patron', key: 'patron', label: 'Patron' },
  { href: '/about', key: 'about', label: 'About' },
  { href: '/support', key: 'support', label: 'Support' },
  { href: '/mail', key: 'mail', label: 'Mail' },
];

// Page path without extension or trailing slash. The build emits the homepage
// as /index.html (build.format: 'file'), so /index is the homepage too.
export const pagePath = pathname =>
  pathname.replace(/\.html$/, '').replace(/\/(index)?$/, '') || '/';
