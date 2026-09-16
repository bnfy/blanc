"""Build a self-contained local review document, with no external media requests."""
from pathlib import Path
import base64, html, json, re
P=Path(__file__).resolve().parent
R=P.parents[2]
esc=html.escape

def data(p,mime):return 'data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode()
def para(text):return ''.join('<p>'+esc(x).replace('\n','<br>')+'</p>' for x in text.split('\n\n') if x)
assets=json.loads((P/'assets.json').read_text());byid={a['id']:a for a in assets}
posts=json.loads((P/'posts.json').read_text())
fonts='@font-face{font-family:Newsreader;src:url('+data(R/'site/node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2','font/woff2')+');font-weight:400}@font-face{font-family:Inter;src:url('+data(R/'src/renderer/pages/inter-latin.woff2','font/woff2')+');font-weight:100 900}'
css='''.directions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.directions img{width:100%;display:block}.directions h3{font-size:22px;margin:14px 0 8px}.directions figure{border:1px solid #DDD2C2;background:#FFFCF7;padding:10px} *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#F7F0E5;color:#12100B;font:16px/1.65 Inter,Arial,sans-serif}main{max-width:1200px;margin:auto;padding:52px 24px 100px}header{max-width:840px;margin:0 auto 64px;text-align:center}header img{width:92px;height:92px}h1,h2,h3{font-family:Newsreader,Georgia,serif;font-weight:400;line-height:1.1}h1{font-size:54px;margin:24px 0}h2{font-size:36px;margin:56px 0 24px}h3{font-size:26px;margin:0 0 20px}p{margin:12px 0}a{color:#805D28}nav{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:24px 0}nav a{border:1px solid #DDD2C2;padding:8px 14px;border-radius:6px;text-decoration:none}.muted,small{color:#6B6257}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.four{grid-template-columns:repeat(4,minmax(0,1fr))}.card{padding:24px;background:#FFFCF7;border:1px solid #DDD2C2;border-radius:12px;overflow:hidden}.visual{text-align:center}video{width:100%;max-width:320px;aspect-ratio:9/16;background:#EFE6D8;border-radius:6px;display:block;margin:0 auto 16px}figure{margin:0}figure img{width:100%;height:auto;display:block}.badge{color:#805D28;font-size:13px;letter-spacing:.04em}.caption{white-space:pre-wrap;font-size:17px}.placement{scroll-margin-top:24px;margin:16px 0}.placement h3{margin-bottom:10px}.article{max-width:780px;margin:auto;font-size:18px}.article h1{font-size:40px}.transcript{font-size:14px;text-align:left}summary{cursor:pointer;color:#805D28;margin:8px 0}section{scroll-margin-top:24px}.status{font-size:13px;margin-top:12px}button{font:inherit;background:#805D28;color:#FFFCF7;border:0;border-radius:4px;padding:8px 14px;cursor:pointer}@media(max-width:700px){main{padding:28px 16px 60px}h1{font-size:40px}.grid,.four{grid-template-columns:1fr}.four{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:16px}h2{font-size:32px}}'''
out=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blanc · Sunrise content review · revision 6</title><style>'+fonts+css+'</style><main>']
out+=['<header><img src="'+data(R/'site/public/sunrise-hero-mark.png','image/png')+'" alt="Original gold Sunrise symbol"><div class="badge">SUNRISE · REVISION 6</div><h1>Social content review.</h1><p>Four source ideas, adapted into one week of social content.</p><p class="muted">Three distinct visual approaches: tactile checklist, mechanism and diagrams, expressive questions. The Sunrise symbol appears alone, without a wordmark or recurring header label. Headlines now use Newsreader Medium (500), one weight up from regular. This page embeds all images, videos and fonts, so previews do not depend on local file links or an internet connection.</p><p><strong>Awaiting your review.</strong> Nothing in this batch has been uploaded, scheduled or published.</p><nav><a href="#type">Headline comparison</a><a href="#directions">Visual directions</a><a href="#videos">Videos</a><a href="#carousel">Carousel</a><a href="#stories">Stories</a><a href="#captions">Exact captions</a><a href="#article">Article</a></nav><div id="media-status" class="status" role="status">Checking embedded media…</div></header>']
out+=['<section id="type"><h2>A little more weight.</h2><p class="muted">Previous regular (400) above; Newsreader Medium (500) below. Same size, layout and wording. The new weight is applied throughout the social artwork for this review.</p><figure><img style="max-width:1080px" src="'+data(P/'headline-weight-comparison.png','image/png')+'" alt="Comparison of the same Before you switch browsers headline: regular 400 above, medium 500 below."></figure></section>']
out+=['<section id="directions"><h2>One identity. Different compositions.</h2><p class="muted">The carousel changes layout as the idea develops. The videos use different visual approaches.</p><div class="directions">']
for key,title,desc in [('trial','A useful trial','Tactile imagery, a task checklist and a decision diagram.'),('simple','A design question','Warm-ink sculpture, a return path and a menu diagram.'),('switch','An invitation','Expressive typography, contrasting bands and conversation shapes.')]:
 a=byid[key+'-scene-1'];out+=['<figure><a href="#media-'+key+'"><img src="'+data(P/a['png'],'image/png')+'" alt="'+esc(a['alt'])+'"></a><figcaption><h3>'+title+'</h3><p class="muted">'+desc+'</p></figcaption></figure>']
out+=['</div></section>']
vids=[('trial','Before you switch browsers',24,[f'trial-scene-{i}' for i in range(1,5)]),('simple','Clean is a look. Simple is a test',18,[f'simple-scene-{i}' for i in range(1,4)]),('switch','What would stop you switching?',18,[f'switch-scene-{i}' for i in range(1,4)]),('simple-tiktok','TikTok alternate opening',18,['simple-tiktok-hook','simple-scene-2','simple-scene-3'])]
out+=['<section id="videos"><h2>Finished videos</h2><p class="muted">Silent videos. Each card stays on screen for six seconds. Use the native play control.</p><div class="grid">']
for k,title,duration,ids in vids:
 out+=['<article class="card visual" id="media-'+k+'"><h3>'+esc(title)+'</h3><video controls playsinline preload="metadata" aria-label="'+esc(title)+'" poster="'+data(P/(ids[0]+'.png'),'image/png')+'" src="'+data(P/(k+'-1080x1920.mp4'),'video/mp4')+'"></video><small>'+str(duration)+' seconds · 1080 × 1920 · Sunrise revision 6</small><details class="transcript"><summary>Exact on-screen text and accessibility transcript</summary>']
 for i,key in enumerate(ids):
  a=byid[key];out+=['<p><strong>'+str(i*6)+'–'+str((i+1)*6)+'s:</strong> '+esc(a['transcript'])+'</p>']
 out+=['<p>The exact original gold Sunrise mark appears throughout. Scene treatments mix warm ivory, ink and gold, with original conceptual illustrations and generic diagrams. These are editorial metaphors, not product footage.</p></details></article>']
out+=['</div></section>']
for section,heading,prefix in [('carousel','Four-panel carousel','trial-carousel'),('stories','Four Story placements','trial-scene')]:
 out+=['<section id="'+section+'"><h2>'+heading+'</h2><div class="grid four">']
 for i in range(1,5):
  a=byid[f'{prefix}-{i}'];out+=['<figure class="card"><img src="'+data(P/a['png'],'image/png')+'" alt="'+esc(a['alt'])+'"><figcaption><small>Panel '+str(i)+'</small><details><summary>Exact alt text</summary><p>'+esc(a['alt'])+'</p></details></figcaption></figure>']
 out+=['</div></section>']
out+=['<section id="captions"><h2>Exact captions & placements</h2><p class="muted">Day numbers begin when the program starts; these are not launch dates. Proposed times are Eastern and will be moved to a future staffed slot after approval. Stories have no added caption, sticker, poll or music.</p><nav>']
for platform in ['x','threads','instagram','tiktok','facebook','substack']:out+=['<a href="#platform-'+platform+'">'+esc({'x':'X','tiktok':'TikTok'}.get(platform,platform.title()))+'</a>']
out+=['</nav>']
for platform in ['x','threads','instagram','tiktok','facebook','substack']:
 out+=['<h3 id="platform-'+platform+'">'+esc({'x':'X','tiktok':'TikTok'}.get(platform,platform.title()))+'</h3>']
 for post in [p for p in posts if p['platform']==platform]:
  caption=post.get('caption') or '';asset=post.get('asset') or 'Text only';anchor=None
  if '.mp4' in asset:anchor='media-'+asset.replace('-1080x1920.mp4','')
  elif 'carousel' in asset:anchor='carousel'
  elif 'scene' in asset:anchor='stories'
  elif '.md' in asset:anchor='article'
  out+=['<article class="card placement" id="'+post['id']+'"><div class="badge">'+esc(post['id'])+' · DAY '+str(post['day'])+' · '+esc(post['format'])+'</div><p class="muted">'+esc(post['suggestedLocalTime'])+' Eastern · '+('<a href="#'+anchor+'">View finished media</a>' if anchor else 'Text only')+'</p><div class="caption">'+esc(caption)+'</div></article>']
out+=['</section><section id="article"><h2>Complete Substack article</h2><article class="card article">']
for block in (P/'article.md').read_text().strip().split('\n\n'):
 if block.startswith('# '):out+=['<h1>'+esc(block[2:])+'</h1>']
 elif block.startswith('## '):out+=['<h2>'+esc(block[3:])+'</h2>']
 else:out+=[para(block)]
out+=['</article></section><p class="muted">Revision 6 tests slightly stronger Newsreader Medium (500) headlines. Symbol-only headers and supporting text remain unchanged. Original conceptual artwork was created with image generation; the Sunrise mark, typography and diagrams were composed from native assets. Publication and creator sending approvals remain separate.</p></main><script>\nconst imgs=[...document.images],vids=[...document.querySelectorAll("video")];function check(){const good=imgs.filter(i=>i.complete&&i.naturalWidth>0).length;const ready=vids.filter(v=>v.readyState>=1).length;document.getElementById("media-status").textContent=`Embedded images: ${good}/${imgs.length} loaded. Videos: ${ready}/${vids.length} ready.`;}imgs.forEach(i=>{i.addEventListener("load",check);i.addEventListener("error",check)});vids.forEach(v=>{v.addEventListener("loadedmetadata",check);v.addEventListener("error",check)});window.addEventListener("load",check);check();\n</script></html>']
(P/'review.html').write_text(''.join(out))
print('Created self-contained review.html with 13 embedded images, 4 embedded videos, all captions and complete article.')

# Keep the Markdown approval text aligned with the actual media and JSON queue.
md=['# Sunrise revision 6 — varied visual directions\n','Finished local creative, awaiting final approval. Earlier revisions are superseded.\n','[Open the self-contained review](<'+str(P/'review.html')+'>). Native video controls and all media are embedded.\n','Three visual directions replace the repeated template: tactile editorial checklist, dark mechanism with diagrams, and expressive questions. The original Sunrise mark, warm palette and type family remain consistent. Conceptual imagery is not product footage.\n']
for k,title,duration,ids in vids:
 md+=['## '+title+'\n','!['+title+']('+str(P/(k+'-1080x1920.mp4'))+')\n','Exact on-screen transcript:\n']
 for i,key in enumerate(ids):md+=['- '+str(i*6)+'–'+str((i+1)*6)+'s: '+byid[key]['transcript']+'\n']
for section,heading,prefix in [('carousel','Carousel','trial-carousel'),('stories','Stories','trial-scene')]:
 md+=['## '+heading+'\n']
 for i in range(1,5):
  a=byid[f'{prefix}-{i}'];md+=['!['+a['alt']+']('+str(P/a['png'])+')\n','Alt text: '+a['alt']+'\n']
md+=['## Exact captions and placements\n','Day numbers are relative to program start, not launch dates. Times are starting tests in Eastern. Only schedule a future staffed slot after explicit approval. Stories add no caption, music, poll or sticker.\n']
for post in posts:
 md+=['### '+post['id']+' · day '+str(post['day'])+' · '+post['platform']+' '+post['format']+'\n','Asset: '+str(post.get('asset') or 'Text only')+'. Proposed time: '+post['suggestedLocalTime']+' Eastern.\n','> '+(post.get('caption') or '(No added caption.)').replace('\n','\n> ')+'\n']
md+=['## Article\n','[Full exact article](<'+str(P/'article.md')+'>). Also embedded in review.html.\n','## Claims and review\n','Copy remains general browsing advice and editorial opinion. Illustrations and diagrams are conceptual, not a feature demonstration. No new usage, performance, automatic grouping, AI-product or launch-date claims. Creator invitations remain separate approval items.\n']
(P/'review.md').write_text('\n'.join(md))
