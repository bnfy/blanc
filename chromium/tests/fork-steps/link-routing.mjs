import assert from 'node:assert/strict';
export default function register(step){
 step('a local profile named {string} and Personal profile settings',async function(name){
  assert.equal((await this.native('profileInfo')).directory,'Default');
  await this.api('openPage',['settings','profiles']);
  const created=await this.call('createProfileWindow',name);assert.equal(created.ok,true);
  this.namedProfile=created.profile;
  // Read/edit Personal's existing Settings document without bringing that
  // window forward: Work remains the OS's last-used window.
 });
}
