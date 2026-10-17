// Invite a Friend (Help menu, /invite): a prefilled email the person sends
// from their own mail app. Blanc sends nothing itself and learns nothing about
// who was invited. The link carries one campaign-wide ref=invite and no
// per-person code, so the site can count invite landings in aggregate without
// tying an invite to an installation.
// No require('electron') here: unit-tested by test/unit/invite-friend.test.js.

const INVITE_URL = 'https://blanc.day/?ref=invite';

// `t` is the interface translator, so the email is in the person's language.
function inviteMessage(t) {
  return {
    subject: t('invite.email.subject'),
    body: [
      t('invite.email.greeting'),
      t('invite.email.pitch'),
      t('invite.email.link', { url: INVITE_URL }),
    ].join('\n\n'),
  };
}

// RFC 6068: no recipient (the person picks one in their mail app), every
// header percent-encoded, CRLF line breaks in the body.
function inviteMailto({ subject, body }) {
  const encode = (text) => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'));
  return `mailto:?subject=${encode(subject)}&body=${encode(body)}`;
}

// Resolves 'mail' once the mail app was asked to open the email, or 'copied'
// when nothing could open it and the invite text went to the clipboard.
async function inviteFriend({ t, openExternal, writeClipboard }) {
  const message = inviteMessage(t);
  try {
    await openExternal(inviteMailto(message));
    return 'mail';
  } catch {
    writeClipboard(`${message.subject}\n\n${message.body}`);
    return 'copied';
  }
}

module.exports = { INVITE_URL, inviteMessage, inviteMailto, inviteFriend };
