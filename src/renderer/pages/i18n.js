'use strict';
// Blanc interface strings: an ICU MessageFormat subset (placeholders, one
// plural per message, numbered non-nesting tags) plus the DOM applier.
// Served flat to every blanc-chrome:// and blanc:// document AND required by
// main and by node tests. Output is always plain text: callers assign it with
// textContent/setAttribute, never innerHTML.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.blancI18n = api;
    if (root.document && root.blancStrings) api.bootstrap(root);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SELECTOR = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/;
  const ARG_HEAD = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(plural)\s*,)?\s*/;

  function parseMessage(source) {
    const text = String(source);
    let i = 0;
    let pluralCount = 0;
    const seenTags = new Set();
    const fail = (why) => { throw new SyntaxError(`${why} at ${i} in ${JSON.stringify(text)}`); };

    function parseArgument(ctx) {
      i += 1; // '{'
      const head = ARG_HEAD.exec(text.slice(i));
      if (!head) fail('Expected an argument name');
      i += head[0].length;
      if (!head[2]) {
        if (text[i] !== '}') fail('Expected }');
        i += 1;
        return { type: 'arg', name: head[1] };
      }
      pluralCount += 1;
      if (pluralCount > 1) fail('Only one plural per message');
      const branches = {};
      for (;;) {
        const sel = SELECTOR.exec(text.slice(i));
        if (!sel) break;
        i += sel[0].length;
        if (branches[sel[1]]) fail(`Duplicate branch ${sel[1]}`);
        branches[sel[1]] = parseNodes({ inPlural: true, tag: ctx.tag });
        if (text[i] !== '}') fail('Expected } after a plural branch');
        i += 1;
      }
      const tail = /^\s*\}/.exec(text.slice(i));
      if (!tail) fail('Expected } after the plural');
      i += tail[0].length;
      if (!branches.other) fail('A plural needs an other branch');
      return { type: 'plural', name: head[1], branches };
    }

    function parseNodes(ctx) {
      const nodes = [];
      let buffer = '';
      const flush = () => { if (buffer) { nodes.push({ type: 'text', value: buffer }); buffer = ''; } };
      while (i < text.length) {
        const ch = text[i];
        if (ch === "'" && text[i + 1] === "'") { buffer += "'"; i += 2; continue; }
        if (ch === '}') { if (ctx.inPlural) break; fail('Unexpected }'); }
        if (ch === '{') { flush(); nodes.push(parseArgument(ctx)); continue; }
        if (ch === '#' && ctx.inPlural) { flush(); nodes.push({ type: 'pound' }); i += 1; continue; }
        if (ch === '<') {
          const close = /^<\/(\d+)>/.exec(text.slice(i));
          if (close) {
            if (ctx.tag === Number(close[1])) break;
            fail('Unexpected closing tag');
          }
          const open = /^<(\d+)>/.exec(text.slice(i));
          if (open) {
            if (ctx.tag !== undefined) fail('Tags cannot nest');
            const index = Number(open[1]);
            if (seenTags.has(index)) fail(`Tag <${index}> used twice`);
            seenTags.add(index);
            flush();
            i += open[0].length;
            const children = parseNodes({ inPlural: ctx.inPlural, tag: index });
            const end = `</${index}>`;
            if (!text.startsWith(end, i)) fail(`Missing ${end}`);
            i += end.length;
            nodes.push({ type: 'tag', index, children });
            continue;
          }
        }
        buffer += ch;
        i += 1;
      }
      flush();
      return nodes;
    }

    const nodes = parseNodes({ inPlural: false, tag: undefined });
    if (i < text.length) fail('Unexpected input');
    if (/\{\s*\w+\s*,\s*(select|selectordinal|number|date|time)\b/.test(text)) fail('Unsupported argument type');
    return nodes;
  }

  function walk(nodes, visit) {
    for (const node of nodes) {
      visit(node);
      if (node.type === 'tag') walk(node.children, visit);
      if (node.type === 'plural') for (const branch of Object.values(node.branches)) walk(branch, visit);
    }
  }

  function analyzeMessage(nodes) {
    const args = new Set();
    const plurals = {};
    const tags = new Set();
    let pluralCount = 0;
    walk(nodes, (node) => {
      if (node.type === 'arg') args.add(node.name);
      if (node.type === 'plural') {
        pluralCount += 1;
        args.add(node.name);
        plurals[node.name] = Object.keys(node.branches).sort();
      }
      if (node.type === 'tag') tags.add(node.index);
    });
    return { args: [...args].sort(), plurals, tags: [...tags].sort((a, b) => a - b), pluralCount };
  }

  function maxLiteralLength(nodes) {
    let total = 0;
    for (const node of nodes) {
      if (node.type === 'text') total += node.value.length;
      else if (node.type === 'tag') total += maxLiteralLength(node.children);
      else if (node.type === 'plural') {
        total += Math.max(...Object.values(node.branches).map(maxLiteralLength));
      }
    }
    return total;
  }

  function stringifyMessage(nodes) {
    return nodes.map((node) => {
      if (node.type === 'text') return node.value.replace(/'/g, "''");
      if (node.type === 'arg') return `{${node.name}}`;
      if (node.type === 'pound') return '#';
      if (node.type === 'tag') return `<${node.index}>${stringifyMessage(node.children)}</${node.index}>`;
      const branches = Object.entries(node.branches)
        .map(([selector, branch]) => `${selector} {${stringifyMessage(branch)}}`).join(' ');
      return `{${node.name}, plural, ${branches}}`;
    }).join('');
  }

  function render(nodes, ctx, out, tag) {
    const push = (value) => {
      const last = out[out.length - 1];
      if (last && last.tag === tag) last.text += value;
      else out.push(tag === undefined ? { text: value } : { tag, text: value });
    };
    for (const node of nodes) {
      if (node.type === 'text') push(node.value);
      else if (node.type === 'arg') {
        push(Object.prototype.hasOwnProperty.call(ctx.params, node.name)
          ? String(ctx.params[node.name]) : `{${node.name}}`);
      } else if (node.type === 'pound') push(ctx.number.format(ctx.count));
      else if (node.type === 'tag') render(node.children, ctx, out, node.index);
      else if (node.type === 'plural') {
        const count = Number(ctx.params[node.name]);
        const branch = node.branches[`=${count}`]
          ?? node.branches[ctx.plural.select(count)]
          ?? node.branches.other;
        render(branch, { ...ctx, count }, out, tag);
      }
    }
    return out;
  }

  function createTranslator({ locale, formatLocale = locale, messages, fallback = {}, onMissing } = {}) {
    const own = Object.prototype.hasOwnProperty;
    const number = new Intl.NumberFormat(formatLocale);
    const pluralFor = { own: new Intl.PluralRules(locale), fallback: new Intl.PluralRules('en') };
    const cache = new Map();
    const reported = new Set();

    function lookup(key) {
      if (cache.has(key)) return cache.get(key);
      let entry = null;
      if (own.call(messages, key)) entry = { nodes: parseMessage(messages[key]), plural: pluralFor.own };
      else if (own.call(fallback, key)) entry = { nodes: parseMessage(fallback[key]), plural: pluralFor.fallback };
      if (entry) cache.set(key, entry);
      return entry;
    }

    function parts(key, params = {}) {
      const entry = lookup(key);
      if (!entry) {
        if (!reported.has(key)) { reported.add(key); onMissing?.(key); }
        return [{ text: key }];
      }
      return render(entry.nodes, { params, number, plural: entry.plural, count: 0 }, [], undefined);
    }

    const t = (key, params) => parts(key, params).map((part) => part.text).join('');
    t.parts = parts;
    t.has = (key) => own.call(messages, key) || own.call(fallback, key);
    t.locale = locale;
    t.formatLocale = formatLocale;
    return t;
  }

  return { parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage, createTranslator };
});
