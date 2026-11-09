// Shipping's chrome is a full-window WebContents. The fork's strip is only
// 68px high in Island mode; in vertical mode it fills the window for the rail.
// Keep the resize and rendered-size assertions, addressing the actual views.
async function resize(width, height) {
 await this.frame('strip').bringToFront();
 await this.call('setWindowContentSize', width, height);
 await this.waitFor(() => this.call('windowContentBounds'),
  b => b?.width === width && b?.height === height, `${width}x${height} content bounds`, 7000);
 if (await this.call('tabLayout') === 'vertical') {
  await this.waitFor(() => this.frame('strip').evaluate(() => ({width: innerWidth, height: innerHeight})),
   b => b.width === width && b.height === height, `${width}x${height} rail renderer viewport`, 7000);
 }
}
export const WINDOW_LAYOUT_STEPS = new Map([
 ['I resize the desktop window to {int} by {int}', resize],
 ['a {int} by {int} desktop window with the vertical tab layout', async function(width, height) {
  await this.call('setTabLayout', 'vertical');
  await resize.call(this, width, height);
  this.verticalWindow = {width, height};
  if (width === 640 && height === 480) await this.call('groupActiveByName', 'minimum-window-group-label');
  await this.frame('strip').waitForFunction(() => document.documentElement.dataset.tabLayout === 'vertical');
  await this.frame('strip').locator('#verticalTabsRail:not([hidden])').waitFor();
 }],
]);
