// Navigation content for the masthead's mega menus and the mobile sheet.
// Feature descriptions are each feature page's own headline, so the menu
// never says more than the page; test/unit/site-navigation.test.js keeps
// them in step. The release card's version and names are filled in by
// Header.astro from site/src/data at build time.
export const menus = [
  {
    key: 'features',
    label: 'features',
    groups: [
      { title: 'Interface', links: [
        { href: '/features/island', label: 'The island', description: 'One small island. The whole browser.' },
        { href: '/features/vertical-tabs', label: 'Vertical tabs', description: 'A tab rail when you want one. The island either way.' },
        { href: '/features/tab-groups', label: 'Tab groups', description: 'Keep the tabs you need. Tuck away the rest.' },
        { href: '/features/quiet-tabs', label: 'Quiet tabs', description: 'Tabs you are not using give their memory back.' },
      ] },
      { title: 'Privacy', links: [
        { href: '/features/ad-blocking', label: 'Ad blocking', description: 'A clearer control for a quieter site.' },
        { href: '/features/private-tabs', label: 'Private tabs', description: 'Private tabs that stay out of the record.' },
        { href: '/features/security', label: 'Security', description: 'Private by architecture.' },
      ] },
      { title: 'Workflow', links: [
        { href: '/features/command-palette', label: 'Command palette', description: 'One shortcut to move through your whole session.' },
        { href: '/features/sync', label: 'Sync', description: 'Your open tabs, on your other devices.' },
      ] },
    ],
    spotlight: { kind: 'image', image: '/feature-island.png', alt: 'The Blanc island resting over a web page', kicker: 'Start here', title: 'One small island. The whole browser.', copy: 'Back, forward, tabs, search and commands in one floating pill.', href: '/features/island', cta: 'See the island' },
    foot: { note: 'Nine features. No account, no AI, no extension store.', label: 'All features', href: '/features' },
  },
  {
    key: 'resources',
    label: 'resources',
    groups: [
      { title: 'Learn', links: [
        { href: '/faq', label: 'FAQ', description: 'Straight answers on price, privacy and AI.' },
        { href: '/about', label: 'About', description: 'A browser with a studio accountable for it.' },
        { href: '/press', label: 'Press', description: 'Fact sheet, captures and the launch card.' },
      ] },
      { title: 'Community', links: [
        { href: '/ambassadors', label: 'Ambassadors', description: 'Help people see a different kind of browser.' },
        { href: '#newsletter', label: 'Newsletter', description: 'Release notes, occasionally.' },
        { href: 'https://github.com/bnfy/blanc', label: 'Source on GitHub', description: 'MIT licensed. Read it, build it, audit it.' },
      ] },
    ],
    spotlight: { kind: 'release', kicker: "What's new", href: '/changelog', cta: 'Read the changelog' },
    foot: { note: 'Blanc is free to browse. Patron is optional.', label: 'Blanc Patron', href: '/#home-patron-title' },
  },
];

export const directLinks = [
  { href: '/changelog', key: 'changelog', label: "What's new" },
  { href: '/download', key: 'download', label: 'Download' },
];
