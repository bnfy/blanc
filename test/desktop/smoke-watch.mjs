// Optional pacing for an owner-observed run; ordinary smoke checks stay fast.
export async function watchStep(app, label) {
  if (process.env.BLANC_SMOKE_WATCH !== '1') return;
  console.log(`WATCH: ${label}`);
  await app.evaluate(({ app, BrowserWindow }, title) => {
    app.focus({ steal: true });
    const windows = BrowserWindow.getAllWindows().filter((window) => window.isVisible());
    for (const window of windows) window.setTitle(`Blanc smoke test — ${title}`);
    windows.find((window) => window.isModal())?.focus();
  }, label);
  await new Promise((resolve) => setTimeout(resolve, 2500));
}
