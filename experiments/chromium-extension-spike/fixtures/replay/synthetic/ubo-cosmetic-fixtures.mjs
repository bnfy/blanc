// Authored outcome fixtures; expected outcomes are asserted independently in
// Electron and Chromium. These are not a real-site coverage claim.
export const cosmeticOrigin='https://page.blanc-fixture.test';
export const cosmeticFilters=[
 'page.blanc-fixture.test###static-ad',
 'page.blanc-fixture.test##.procedural:has-text(SPONSORED)',
 'page.blanc-fixture.test##+js(set-constant, blancParityFlag, true)',
 'page.blanc-fixture.test##+js(no-fetch-if, /blanc-fixture/cosmetic/prevented)',
].join('\n');
export function cosmeticPage(csp=false){
 return {status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8">${csp?'<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'nonce-fixture\'; style-src \'none\'; img-src data:">':''}
<link rel="icon" href="data:,"><title>uBO cosmetic fixture</title>
<script nonce="fixture">window.fixtureStartFlag=window.blancParityFlag===true;window.fixtureStart='ran';</script>
<div id="static-ad">static ad</div><div id="control">ordinary content</div>
<div id="procedure" class="procedural">SPONSORED</div><div id="negative" class="procedural">ordinary</div>
<div id="destination"></div>`};
}
