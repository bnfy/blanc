// Preserve process-exit facts before fixture cleanup clears child handles.
// A spawn error without a PID, or a failed kill, is not a successful exit.
export function snapshotOwnedExit(child,state) {
  const exitCode=typeof child?.exitCode==='number'?child.exitCode:null;
  const signalCode=typeof child?.signalCode==='string'?child.signalCode:null;
  return Object.freeze({pid:child?.pid??null,proven:!!child?.pid&&!!state?.exited()&&(exitCode!==null||signalCode!==null),exitCode,signalCode});
}
