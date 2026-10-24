import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Index rendered public copy, never Astro source, scripts, navigation, or
// unpublished/noindex pages. Keep links canonical and snippets plain text.
export function plainText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
  return html.replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, ' ').replace(/<(script|style|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? whole;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }).replace(/\s+/g, ' ').trim();
}
const attr = (html, name) => html.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];
export function indexPage(html, path) {
  if (/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)) return [];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) return [];
  const title = plainText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? path).replace(/\s*[—|]\s*Blanc.*$/, '');
  const category = path.startsWith('/features') ? 'Features' : path.startsWith('/mail') ? 'Mail' : path.startsWith('/whats-new') || path === '/changelog' ? 'Release notes' : path === '/support' ? 'Support' : 'Website';
  const documents = [];
  // The bang directory already has its own dedicated search. Thousands of
  // site codes would swamp ordinary website results and the download size.
  let body = main.replace(/<ol\b[^>]*id="bangs-rows"[^>]*>[\s\S]*?<\/ol>/gi, ' ');
  // FAQ answers and individual releases get their own deep links.
  const pattern = path === '/changelog' ? /<article\b[^>]*>[\s\S]*?<\/article>/gi : /<details\b[^>]*>[\s\S]*?<\/details>/gi;
  body = body.replace(pattern, block => {
    const id = attr(block.slice(0, block.indexOf('>') + 1), 'id');
    const heading = block.match(/<(summary|h2)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
    if (!id || !heading) return block;
    documents.push({ url: `${path}#${id}`, title: plainText(heading), category, text: plainText(block) });
    return ' ';
  });
  documents.unshift({ url: path, title, category, text: plainText(body) });
  return documents;
}
// Use the same canonical-page check for disk builds and live development.
export function indexCanonicalPage(html, path) {
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  if (!canonical) return [];
  const url = new URL(canonical);
  return url.pathname === path && !url.search && !url.hash ? indexPage(html, path) : [];
}

export async function buildDevelopmentIndex(origin, fetchPage = fetch) {
  const read = async path => {
    const response = await fetchPage(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Search source ${path} returned ${response.status}`);
    return response.text();
  };
  const sitemap = await read('/sitemap.xml');
  // The sitemap is our existing public-route manifest. Only borrow its paths:
  // every request stays on the dev server, regardless of its canonical domain.
  const paths = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => {
    const url = new URL(plainText(match[1]));
    if (url.search || url.hash || url.pathname === '/search-index.json' || url.pathname.startsWith('//')) throw new Error('Invalid search source');
    return url.pathname;
  }))];
  if (!paths.length) throw new Error('Search sitemap contains no pages');
  const documents = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (next < paths.length) {
      const path = paths[next++];
      documents.push(...indexCanonicalPage(await read(path), path));
    }
  }));
  return documents.sort((a, b) => a.url.localeCompare(b.url));
}

export function developmentIndexCache(build) {
  let revision = 0;
  let cached;
  let pending;
  return {
    invalidate() { revision++; cached = undefined; },
    async get() {
      if (cached?.revision === revision) return cached.documents;
      if (pending?.revision === revision) return pending.promise;
      const generation = revision;
      const promise = Promise.resolve().then(build).then(documents => {
        if (generation === revision) cached = { revision: generation, documents };
        return documents;
      }).finally(() => { if (pending?.promise === promise) pending = undefined; });
      pending = { revision: generation, promise };
      return promise;
    },
  };
}

export default function searchIndex() {
  let devOrigin;
  let protocol = 'http';
  return { name: 'blanc-search-index', hooks: {
    'astro:server:setup': ({ server, logger }) => {
      protocol = server.config.server.https ? 'https' : 'http';
      const cache = developmentIndexCache(() => {
        if (!devOrigin) throw new Error('Development server is not listening');
        return buildDevelopmentIndex(devOrigin);
      });
      const invalidate = path => {
        if (!/(?:^|[/\\])(?:node_modules|dist|\.astro|\.git)(?:[/\\]|$)/.test(path)) cache.invalidate();
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, invalidate);
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, invalidate);
      });
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/search-index.json') return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(request.method)) {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          return response.end();
        }
        try {
          const documents = await cache.get();
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(documents));
        } catch (error) {
          logger.warn(`Search index could not load: ${error.message}`);
          response.statusCode = 503;
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Search index unavailable. Retry after fixing the source page.' }));
        }
      });
    },
    'astro:server:start': ({ address }) => {
      // Never derive the fetch destination from the incoming Host header.
      const host = address.address === '0.0.0.0' ? '127.0.0.1' : address.address === '::' ? '::1' : address.address;
      devOrigin = `${protocol}://${host.includes(':') ? `[${host}]` : host}:${address.port}`;
    },
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      const documents = [];
      async function walk(folder) {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          const file = join(folder, entry.name);
          if (entry.isDirectory()) { if (entry.name !== '_astro') await walk(file); continue; }
          if (!entry.name.endsWith('.html')) continue;
          const html = await readFile(file, 'utf8');
          const local = '/' + relative(root, file).replaceAll('\\', '/').replace(/\.html$/, '').replace(/(^|\/)index$/, '');
          documents.push(...indexCanonicalPage(html, local));
        }
      }
      await walk(root);
      documents.sort((a, b) => a.url.localeCompare(b.url));
      await writeFile(join(root, 'search-index.json'), JSON.stringify(documents));
      console.log(`Search: indexed ${documents.length} public pages and answers.`);
    },
  } };
}
