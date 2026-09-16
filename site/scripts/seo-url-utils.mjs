// Decode each supported entity once; nested &amp;quot; stays literal &quot;.
export function decodeAttribute(value = '') {
  const entities = { '&amp;': '&', '&quot;': '"', '&#39;': "'" };
  return value.replace(/&(?:amp|quot|#39);/g, (entity) => entities[entity]);
}

export function internalPath(href, origin) {
  if (!href.startsWith('/') && !/^https?:\/\//i.test(href)) return null;
  try {
    const target = new URL(href, origin);
    return target.origin === new URL(origin).origin ? target.pathname : null;
  } catch {
    return null;
  }
}
