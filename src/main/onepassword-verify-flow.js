'use strict';

// Persist-first Verify, pure and injectable (plan Task 9): save the raw
// field text through the normal settings path, probe the NORMALIZED stored
// value — never the raw text, so the probe cannot race the field's own
// asynchronous change-save — and after the broker await require the stored
// account to still equal the probed value. Another window can change the
// device-level setting mid-flight; that request is superseded and replies
// {ok:false, stale:true}, which the renderer discards silently. Stale beats
// even a broker error: a superseded request has no error worth showing.
// Reply shapes are exact: {ok:true, account} | {ok:false, kind, account} |
// {ok:false, stale:true}. Nothing else may cross pages IPC from here.

const { kindForErrorCode } = require('./fill-status-kinds');

async function runOnePasswordVerify({ account, saveAccount, readStoredAccount, brokerVerify }) {
  const persisted = saveAccount(typeof account === 'string' ? account : '');
  const probed = typeof persisted === 'string' ? persisted.trim() : '';
  if (!probed) return { ok: false, kind: 'account-not-found', account: '' };
  let failure = null;
  try {
    await brokerVerify(probed);
  } catch (error) {
    failure = error;
  }
  if (String(readStoredAccount() ?? '').trim() !== probed) return { ok: false, stale: true };
  if (failure) return { ok: false, kind: kindForErrorCode(failure?.code), account: probed };
  return { ok: true, account: probed };
}

module.exports = { runOnePasswordVerify };
