// Questions about Blanc Mail, shown on /mail (#support) and on the Support
// page's Mail tab. One source, so the two pages never say different things.
// `id` is used only on /support (prefixed mail-), where every answer is a
// deep link; /mail renders these without ids.
export const mailQuestions = [
  { id: 'mail-new-address', title: 'Do I need a new email address?', answer: 'You can keep your current address. Connect a Google account directly, or a Proton account through Proton Mail Bridge on your Mac. You can also use a Blanc address on its own.' },
  { id: 'mail-tools', title: 'Which tools help me keep up with mail?', answer: 'Bring up to five Gmail accounts into one inbox. Snooze a conversation, reuse a reply template, or schedule a message to go out when Blanc Mail is running and online on your Mac.' },
  { id: 'mail-ghost-mode', title: 'How can I keep conversations off my screen?', answer: 'Ghost Mode hides a conversation or Gmail label and locks it again on a timer. Touch ID or your password brings it back into view. Ghost Mode controls what appears on screen.' },
  { id: 'mail-reserve', title: 'What does reserving a name get me?', answer: 'A confirmed reservation holds your name across the Blanc endings until 30 days after addresses open. Use the email you reserved with to claim it. The mailbox starts when you claim the address with an eligible paid plan.' },
  { id: 'mail-trial', title: 'Can I try the Mac app first?', answer: 'At launch the Mac app will have a 14-day local trial. You can start it without a payment card.' },
  { id: 'mail-encryption', title: 'What is encrypted in a Blanc mailbox?', answer: 'Messages and attachments in your Blanc mailbox are encrypted where they are stored, with a key made on your Mac. Blanc keeps only a copy of the key locked with your password, which stays on your Mac. Senders, recipients, subjects and dates remain visible. The server can read mail as it arrives and as it is sent.' },
  { id: 'mail-password', title: 'What if I forget my mailbox password?', answer: 'A code sent to your backup email gets you back into your account. On a new Mac, a forgotten password means you cannot open mail you received before recovery.' },
  { id: 'mail-subscription-ends', title: 'What happens if my subscription ends?', answer: 'In the Mac app you can still read, search and export mail. Composing and sending resume when you renew. A Blanc mailbox keeps receiving mail for 30 days after your subscription lapses. Before deleting a mailbox, Blanc emails you instructions for exporting your mail.' },
  { id: 'mail-bundle', title: 'I’m a Browser Patron. How will the Bundle work?', answer: 'At launch, you can upgrade through Polar on the same billing period. Your existing Browser key keeps working. Patron and founding benefits apply to Browser, and its free features stay free.' },
];

export const mailSupportTopics = [
  { id: 'mail-accounts', title: 'Accounts and data', html: 'Blanc Mail connects to Gmail with Google Sign-In. Removing an account clears its local cache after any pending draft recovery is resolved. You can also revoke the app’s access from your <a href="https://myaccount.google.com/permissions">Google Account permissions</a>.' },
  { id: 'mail-uninstall', title: 'Uninstalling', html: 'Quit the app and move Blanc Mail to the Trash. To erase local settings and recovery data too, first resolve any drafts you need, then remove the app’s data under your Mac’s Application Support folder. Renaming the app does not erase an existing test install’s local data or Keychain credentials.' },
  { id: 'mail-updates', title: 'Updates and licensing', html: 'After launch, Check for Updates in the app will use its signed Sparkle feed. New subscriptions will be handled by Polar. Existing beta keys will continue to work. To have a previous key sent again, email <!--email_off--><a href="mailto:support@blanc.day">support@blanc.day</a><!--/email_off--> from the address you bought it with.' },
];
