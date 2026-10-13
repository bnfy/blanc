import legacyRoutes from "../data/legacy-routes.json" with { type: "json" };
import { FORMER_SITE_ORIGIN, SITE_ORIGIN } from "./site-origin.mjs";
// Resolve internal links in immutable release-note data at render time. Notes
// written before the move link to the former origin, which is still ours.
const OWN_ORIGINS = new Set([SITE_ORIGIN, FORMER_SITE_ORIGIN]);
export function currentWebsiteLink(href) {
  let url;
  try {
    url = new URL(href, SITE_ORIGIN);
  } catch {
    return href;
  }
  if (!OWN_ORIGINS.has(url.origin)) return href;
  const destination = legacyRoutes[url.pathname.replace(/\/$/, "")];
  if (!destination) return href;
  const target = new URL(destination, url.origin);
  const topic = target.searchParams.get("topic");
  target.searchParams.delete("topic");
  if (url.hash) target.hash = url.hash;
  else if (topic) target.hash = topic;
  return target.pathname + target.search + target.hash;
}
