import test from 'node:test';import assert from 'node:assert/strict';import {parseReadinessUrl,isBlockedReadinessUrl} from './ubo-readiness-fixtures.mjs';
test('exact blocked hosts match, path and query text do not',()=>{
 assert(isBlockedReadinessUrl('https://securepubads.g.doubleclick.net/tag/js/gpt.js'));
 assert(isBlockedReadinessUrl('https://blocked.blanc-fixture.test/initial'));
 assert(!isBlockedReadinessUrl('https://allowed.blanc-fixture.test/securepubads.g.doubleclick.net?host=blocked.blanc-fixture.test'));
 assert.equal(parseReadinessUrl('https://page.blanc-fixture.test/').hostname,'page.blanc-fixture.test');
});
test('lookalike hosts, credentials, alternate ports, HTTP and malformed URLs fail closed',()=>{
 for(const url of ['https://securepubads.g.doubleclick.net.evil.test/a','https://evil-securepubads.g.doubleclick.net/a','https://securepubads.g.doubleclick.net@evil.test/a','https://user@allowed.blanc-fixture.test/a','https://allowed.blanc-fixture.test:8443/a','http://allowed.blanc-fixture.test/a','not a URL'])assert.throws(()=>isBlockedReadinessUrl(url));
});
