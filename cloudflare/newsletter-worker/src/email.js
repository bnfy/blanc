// The branded layout every Blanc email uses: the lockup on Blanc White, one
// white card, and a fine-print footer with the tagline. docs/brand-usage.md
// (*Email*) describes the treatment; the Resend win-back templates are
// rendered from this same function, and bnfy/blanc-mail's
// services/mail-worker/src/email.js mirrors it for the Blanc Mail licence
// email, so change them together.
//
// Many email clients drop <style> blocks, SVG and often WebP, so the layout is
// inline-styled tables and the lockup is the media kit's 480px PNG. The one
// <style> block only declares Instrument Sans, the app's face, served from
// blanc.day: Apple Mail, Outlook for Mac and Thunderbird load it, while Gmail
// and Outlook for Windows ignore it and use the system sans.

export const LOCKUP_URL = 'https://blanc.day/press/blanc-lockup-ink-480.png';
export const FONT_URL = 'https://blanc.day/fonts/instrument-sans/instrument-sans-latin-wdth-normal.woff2';

const COLORS = {
  page: '#F8F2E8', // Blanc White
  card: '#FFFFFF',
  border: '#E1D7C9',
  ink: '#111111',
  muted: '#6B6257',
  gold: '#805D28',
};
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
// The app sets Instrument Sans at width 98 and +0.01em.
const FACE = `font-family:${SANS};font-stretch:98%;letter-spacing:0.01em;`;
const FONT_FACE = `<style>@font-face{font-family:'Instrument Sans';src:url(${FONT_URL}) format('woff2');font-weight:400 700;font-stretch:75% 100%;font-style:normal;}</style>`;

export const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const text = (size, line, color) => `${FACE}font-size:${size}px;line-height:${line}px;color:${color};`;

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// A paragraph is plain text, { lead, text } for a bold lead-in, or { code }
// for something the reader copies, such as a licence key.
const paragraph = (item) => {
  if (item.code) {
    return `<tr><td style="padding-bottom:16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORS.page}" style="background-color:${COLORS.page};border:1px solid ${COLORS.border};border-radius:8px;padding-top:12px;padding-bottom:12px;padding-left:16px;padding-right:16px;font-family:${MONO};font-size:17px;line-height:24px;letter-spacing:0.04em;color:${COLORS.ink};">${escapeHtml(item.code)}</td></tr></table></td></tr>`;
  }
  const body = typeof item === 'string'
    ? escapeHtml(item)
    : `<strong style="color:${COLORS.ink};">${escapeHtml(item.lead)}</strong> ${escapeHtml(item.text)}`;
  return `<tr><td style="padding-bottom:16px;${text(16, 24, COLORS.ink)}">${body}</td></tr>`;
};

const button = ({ label, url }) => `<tr><td style="padding-top:8px;padding-bottom:24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${COLORS.ink}" style="background-color:${COLORS.ink};border-radius:8px;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding-top:12px;padding-bottom:12px;padding-left:22px;padding-right:22px;${text(15, 20, COLORS.page)}font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table></td></tr>`;

// finePrint lines are trusted HTML (they carry unsubscribe links); everything
// else is escaped.
export function renderEmail({ preheader, heading, paragraphs = [], action, after = [], signature, finePrint = [] }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">${FONT_FACE}<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.page};">${escapeHtml(preheader ?? heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding-top:36px;padding-bottom:36px;padding-left:16px;padding-right:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding-bottom:24px;padding-left:4px;"><a href="https://blanc.day" style="text-decoration:none;"><img src="${LOCKUP_URL}" width="160" height="47" alt="Blanc" border="0" style="display:block;width:160px;height:47px;border:0;outline:none;"></a></td></tr>
<tr><td bgcolor="${COLORS.card}" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding-top:36px;padding-bottom:20px;padding-left:32px;padding-right:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:20px;${FACE}letter-spacing:-0.01em;font-size:28px;line-height:34px;font-weight:500;color:${COLORS.ink};">${escapeHtml(heading)}</td></tr>
${paragraphs.map(paragraph).join('\n')}
${action ? button(action) : ''}
${after.map(paragraph).join('\n')}
${signature ? `<tr><td style="padding-bottom:16px;${text(16, 24, COLORS.ink)}">${signature.map(escapeHtml).join('<br>')}</td></tr>` : ''}
</table></td></tr>
<tr><td style="padding-top:24px;padding-left:4px;padding-right:4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:12px;${text(15, 22, COLORS.gold)}font-weight:500;">A little less browser.</td></tr>
${finePrint.map((line) => `<tr><td style="padding-bottom:8px;${text(12, 18, COLORS.muted)}">${line}</td></tr>`).join('\n')}
</table></td></tr>
</table></td></tr></table></body></html>`;
}

export const fineLink = (label, url) => `<a href="${escapeHtml(url)}" style="color:${COLORS.muted};text-decoration:underline;">${escapeHtml(label)}</a>`;
