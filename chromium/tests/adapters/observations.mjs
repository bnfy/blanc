// DOM audits copied from the v1.46.0 test hook; the shipping assertions run
// unchanged. The only translation is native tab identity to its CDP document.
import {tabPage} from './core.mjs';
const audit=expression=>async w=>{const s=await w.snapshot();const p=await tabPage(w,s.activeTabId);return {page:await p.evalExpression(expression)};};
export const observations={
 // The native command changes the global Quiet Tabs delay; its tab argument
 // scopes dispatch to this window, it does not create a per-tab preference.
 setQuietTabs:async(w,delay)=>w.native('quietDelay',[(await w.snapshot()).activeTabId,delay]),
 readStartPageFontUsage:audit(`(async () => {
        await Promise.all([
          document.fonts.load('22px "Instrument Sans"'),
        ]).catch(() => []);
        const selectors = [
          '.start-brand-date', '.ledger-label', '.bb-clock',
          '.bb-blocked', '.shelf-label', '.shelf-count', '.tally-count',
          '.tally-caption', '.ledger-footer', '.layout-switcher button',
          '.ob-step-label', '.ob-content p'
        ];
        if (selectors.some((selector) => !document.querySelector(selector))) return null;
        const headingSelector = '.bb-clock, .ledger-where, .migration-checklist-heading h2, .ob-content h1';
        const everything = [...document.querySelectorAll('body, body *')];
        const label = (element) => element.id || element.className || element.tagName;
        return {
          samples: selectors.map((selector) => ({
            selector,
            family: getComputedStyle(document.querySelector(selector)).fontFamily,
          })),
          headings: [...document.querySelectorAll(headingSelector)].map((element) => ({
            selector: element.className || 'onboarding h1',
            family: getComputedStyle(element).fontFamily,
          })),
          textFaceLoaded: document.fonts.check('22px "Instrument Sans"'),
          newsreader: everything
            .filter((element) => getComputedStyle(element).fontFamily.includes('Newsreader'))
            .slice(0, 20).map(label),
          jetbrains: everything
            .filter((element) => getComputedStyle(element).fontFamily.includes('JetBrains Mono'))
            .slice(0, 20).map(label),
        };
      })()`),
 readStartPageLayoutFit:audit(`(() => {
        scrollTo(0, 0);
        const root = document.documentElement;
        const body = document.body;
        const describe = (element) => {
          if (element.id) return '#' + element.id;
          const classes = [...element.classList].slice(0, 3);
          return element.tagName.toLowerCase() + (classes.length ? '.' + classes.join('.') : '');
        };
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' &&
            rect.width > 0 && rect.height > 0;
        };
        const hasDirectText = (element) => [...element.childNodes]
          .some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const ignored = (element) => element.matches(
          '.page-sr-only, .mj-sr-only, .mj-skip, [data-dock-label], [aria-hidden="true"], ' +
          '.fav .name, .shelf-tile .name, .shelf-tile .host, .shelf-date, .bb-fav .label'
        );
        const text = [...body.querySelectorAll('*')]
          .filter((element) => visible(element) && hasDirectText(element) && !ignored(element));
        const horizontalText = text.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).map(describe);
        const unreachableText = text.filter((element) => {
          const rect = element.getBoundingClientRect();
          const documentBottom = Math.max(root.scrollHeight, body.scrollHeight);
          return rect.top < -1 || rect.bottom + scrollY > documentBottom + 1;
        }).map(describe);
        const clippedText = text.filter((element) => {
          const style = getComputedStyle(element);
          const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
          const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
          return (clipsX && element.scrollWidth > element.clientWidth + 1) ||
            (clipsY && element.scrollHeight > element.clientHeight + 1);
        }).map(describe);
        const surfaces = [...body.querySelectorAll('main, .ledger-footer')]
          .filter(visible)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1;
          })
          .map(describe);
        const documentBottom = Math.max(root.scrollHeight, body.scrollHeight);
        const maxScrollY = Math.max(0, documentBottom - innerHeight);
        const footer = document.getElementById('layoutFooter')?.getBoundingClientRect();
        const footerOverlaps = footer
          ? [...body.querySelectorAll('main a, main button, main .shelf-card')]
              .filter(visible)
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                const topAtBottom = rect.top - maxScrollY;
                const bottomAtBottom = rect.bottom - maxScrollY;
                return bottomAtBottom > footer.top + 1 && topAtBottom < footer.bottom - 1;
              })
              .map(describe)
          : [];
        return {
          layout: body.dataset.layout ?? null,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          horizontalText,
          unreachableText,
          clippedText,
          surfaces,
          footerOverlaps,
        };
      })()`),
 async emulateReducedMotion(w,on){await w.fixture.host.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:on?'reduce':''}]});return true;},
};
