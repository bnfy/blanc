# Canonical tagged launch URLs — use verbatim, no variants

| Channel | URL | Attribution |
|---|---|---|
| Show HN | https://github.com/bnfy/blanc | GitHub referrer traffic |
| Reddit | https://blancbrowser.com | HTTP referrer (conservative compliance with no-referral-link rules) |
| Product Hunt | https://blancbrowser.com/?ref=ph | GA4 landing page |
| AlternativeTo | https://blancbrowser.com | HTTP referrer (tags discouraged) |
| BetaList | https://blancbrowser.com/?ref=betalist | GA4 landing page |

A variant (`?ref=HN`, `?ref=hackernews`) splits the data and cannot be merged
retroactively in GA4's landing-page report. Copy these exactly. Reddit is the
deliberate clean-URL exception: use the HTTP referrer and do not add a tracking
query that can be mistaken for a prohibited referral link.
