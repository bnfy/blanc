import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// REVIEW ONLY. No publishing capability. The previous numerical creative is retired.
const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../../..');
const embed = async (file,mime) => `data:${mime};base64,${(await fs.readFile(path.join(ROOT,file))).toString('base64')}`;
const news = await embed('site/dist/_astro/newsreader-latin-opsz-normal.s-izfB6B.woff2','font/woff2');
const inter = await embed('src/renderer/pages/inter-latin.woff2','font/woff2');
const sunrise = await embed('site/public/sunrise-hero-mark.png','image/png');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blanc — Yesterday was our busiest day yet — review draft</title><style>
@font-face{font-family:Newsreader;src:url('${news}');font-weight:100 900}
@font-face{font-family:Inter;src:url('${inter}');font-weight:100 900}
*{box-sizing:border-box}body{margin:0;background:#F7F0E5;color:#12100B}
main{width:1080px;height:1350px;overflow:hidden;position:relative;text-align:center;background:radial-gradient(ellipse 620px 320px at 50% 101%,#E8D4AC88,transparent),#F7F0E5}
.mark{position:absolute;top:180px;left:448px;width:184px;height:184px;object-fit:contain}
h1{position:absolute;top:446px;left:55px;right:55px;margin:0;font:400 100px/1.04 Newsreader,serif;letter-spacing:-.025em}
.sub{position:absolute;top:820px;left:90px;right:90px;margin:0;font:400 29px/1.65 Inter,sans-serif;color:#6B6257}
.thanks{position:absolute;top:990px;left:0;right:0;font:400 39px Newsreader,serif;color:#805D28}
.rule{position:absolute;top:1140px;height:1px;left:110px;right:110px;background:linear-gradient(90deg,transparent,#BCA06A,transparent)}
.url{position:absolute;top:1190px;left:0;right:0;font:400 24px Inter,sans-serif;color:#805D28;letter-spacing:.4px}
</style></head><body><main><img class="mark" src="${sunrise}" alt="Original gold Sunrise artwork"><h1>Yesterday was<br>our busiest<br>day yet.</h1><p class="sub">Thanks to all our new<br>and returning users.</p><div class="thanks">We’re glad you’re here.</div><div class="rule"></div><div class="url">blancbrowser.com</div></main></body></html>`;
await fs.writeFile(path.join(OUT,'general-review-v2.html'),html);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 const check=await page.evaluate(()=>({text:document.querySelector('main').innerText,font:document.fonts.check('108px Newsreader'),overflow:document.querySelector('main').scrollHeight>1350}));
 if(/\d/.test(check.text)||check.overflow||!check.font)throw new Error(JSON.stringify(check));
 await page.screenshot({path:path.join(OUT,'general-review-v2-1080x1350.png')});
 console.log(JSON.stringify(check));
}finally{await browser.close()}
