import legacyRoutes from "../data/legacy-routes.json" with { type: "json" };
// Resolve internal links in immutable release-note data at render time.
export function currentWebsiteLink(href) {
  let url;
  try {
    url = new URL(href, "https://blancbrowser.com");
  } catch {
    return href;
  }
  if (url.origin !== "https://blancbrowser.com") return href;
  const destination = legacyRoutes[url.pathname.replace(/\/$/, "")];
  if (!destination) return href;
  const target = new URL(destination, url.origin);
  const topic = target.searchParams.get("topic");
  target.searchParams.delete("topic");
  if (url.hash) target.hash = url.hash;
  else if (topic) target.hash = topic;
  return target.pathname + target.search + target.hash;
}
