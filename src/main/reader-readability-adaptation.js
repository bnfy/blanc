'use strict';

// Reviewed changes to the executable copy of pinned Readability 0.6.0.
// Keep npm's upstream files untouched. Desktop and generated iOS extraction
// use the same adaptation, and an upstream change must match exactly or fail.
function adaptReadability(source) {
  const changes = [
    [
      '^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$',
      /^(?:Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference)$/.source,
    ],
    [
      'if (href.indexOf("javascript:") === 0) {',
      'if (!/^(?:https?:|#)/i.test(toAbsoluteURI(href))) {',
    ],
    [
      '// Remove links with javascript: URIs, since\n        // they won\'t work after scripts have been removed from the page.',
      '// Blanc: retain only resolved HTTP(S) links and local fragments.\n        // Other schemes become text; final DOMPurify sanitization still applies.',
    ],
  ];
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) throw new Error('Readability adaptation input changed; review the upstream update');
    source = source.replace(before, after);
  }
  return source;
}

module.exports = { adaptReadability };
