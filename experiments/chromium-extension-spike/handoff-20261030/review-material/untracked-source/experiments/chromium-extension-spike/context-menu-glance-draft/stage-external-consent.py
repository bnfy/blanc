from pathlib import Path
import shutil,hashlib
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=root/'evidence/context-external-consent-20261030';out.mkdir(exist_ok=False);stage=out/'staged';paths=['chrome/browser/external_protocol/external_protocol_handler.h','chrome/browser/external_protocol/external_protocol_handler.cc','chrome/browser/ui/views/external_protocol_dialog.h','chrome/browser/ui/views/external_protocol_dialog.cc']
for rel in paths:
 p=stage/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/rel,p)
def replace(p,a,b):
 s=p.read_text();assert s.count(a)==1,(p,a[:80],s.count(a));p.write_text(s.replace(a,b,1))
h=stage/paths[0];c=stage/paths[1];dh=stage/paths[2];dc=stage/paths[3]
needle='''  // Allows LaunchUrl to proceed with launching an external protocol handler.'''
extra='''#if !BUILDFLAG(IS_ANDROID) && !BUILDFLAG(IS_CHROMEOS)
  // Same native policy, throttling and handler lookup as LaunchUrl, but asks
  // for consent on every invocation and offers no persistent allow checkbox.
  static void LaunchUrlRequiringConsent(
      const GURL& url, content::WebContents::Getter web_contents_getter,
      ui::PageTransition page_transition, bool has_user_gesture,
      bool is_in_fenced_frame_tree,
      const std::optional<url::Origin>& initiating_origin,
      content::WeakDocumentPtr initiator_document);
  static void RunBlancExternalProtocolDialog(
      const GURL& url, content::WebContents* web_contents,
      ui::PageTransition page_transition, bool has_user_gesture,
      bool is_in_fenced_frame_tree,
      const std::optional<url::Origin>& initiating_origin,
      content::WeakDocumentPtr initiator_document,
      const std::u16string& program_name);
#endif

''';replace(h,needle,extra+needle)
needle='''  static void ClearData(Profile* profile);
};''';repl='''  static void ClearData(Profile* profile);

 private:
  static void LaunchUrlInternal(
      const GURL& url, content::WebContents::Getter web_contents_getter,
      ui::PageTransition page_transition, bool has_user_gesture,
      bool is_in_fenced_frame_tree,
      const std::optional<url::Origin>& initiating_origin,
      content::WeakDocumentPtr initiator_document, bool require_consent
#if BUILDFLAG(IS_ANDROID)
      , mojo::PendingRemote<network::mojom::URLLoaderFactory>* out_factory
#endif
  );
};''';replace(h,needle,repl)
needle='''    const std::u16string& program_name,
    ExternalProtocolHandler::Delegate* delegate) {
  CHECK(web_contents''';replace(c,needle,'''    const std::u16string& program_name, bool require_consent,
    ExternalProtocolHandler::Delegate* delegate) {
  CHECK(web_contents''')
needle='''  ExternalProtocolHandler::RunExternalProtocolDialog(
      url, web_contents, page_transition''';repl='''#if !BUILDFLAG(IS_CHROMEOS)
  if (require_consent) {
    ExternalProtocolHandler::RunBlancExternalProtocolDialog(
        url, web_contents, page_transition, has_user_gesture,
        is_in_fenced_frame_tree, initiating_origin, std::move(initiator_document),
        program_name);
    return;
  }
#endif
  ExternalProtocolHandler::RunExternalProtocolDialog(
      url, web_contents, page_transition''';replace(c,needle,repl)
needle='''    bool prompt_user,
    ui::PageTransition page_transition,''';replace(c,needle,'''    bool prompt_user, bool require_consent,
    ui::PageTransition page_transition,''')
needle='''        std::move(initiator_document), program_name, delegate);''';replace(c,needle,'''        std::move(initiator_document), program_name, require_consent, delegate);''')
needle='''  CHECK_CURRENTLY_ON(content::BrowserThread::UI, base::NotFatalUntil::M161);

  // Disable anti-flood protection if the user is invoking a bookmark or''';repl='''  LaunchUrlInternal(url, std::move(web_contents_getter), page_transition,
                    has_user_gesture, is_in_fenced_frame_tree,
                    initiating_origin, std::move(initiator_document), false
#if BUILDFLAG(IS_ANDROID)
                    , out_factory
#endif
  );
}

#if !BUILDFLAG(IS_ANDROID) && !BUILDFLAG(IS_CHROMEOS)
void ExternalProtocolHandler::LaunchUrlRequiringConsent(
    const GURL& url, content::WebContents::Getter web_contents_getter,
    ui::PageTransition page_transition, bool has_user_gesture,
    bool is_in_fenced_frame_tree,
    const std::optional<url::Origin>& initiating_origin,
    content::WeakDocumentPtr initiator_document) {
  LaunchUrlInternal(url, std::move(web_contents_getter), page_transition,
                    has_user_gesture, is_in_fenced_frame_tree,
                    initiating_origin, std::move(initiator_document), true);
}
#endif

void ExternalProtocolHandler::LaunchUrlInternal(
    const GURL& url, content::WebContents::Getter web_contents_getter,
    ui::PageTransition page_transition, bool has_user_gesture,
    bool is_in_fenced_frame_tree,
    const std::optional<url::Origin>& initiating_origin,
    content::WeakDocumentPtr initiator_document, bool require_consent
#if BUILDFLAG(IS_ANDROID)
    , mojo::PendingRemote<network::mojom::URLLoaderFactory>* out_factory
#endif
) {
  CHECK_CURRENTLY_ON(content::BrowserThread::UI, base::NotFatalUntil::M161);

  // Disable anti-flood protection if the user is invoking a bookmark or''';replace(c,needle,repl)
needle='''std::move(web_contents_getter), block_state == UNKNOWN,
                     page_transition''';replace(c,needle,'''std::move(web_contents_getter), block_state == UNKNOWN || require_consent,
                     require_consent, page_transition''')
needle='''                         content::WeakDocumentPtr initiator_document);''';replace(dh,needle,'''                         content::WeakDocumentPtr initiator_document,
                         bool allow_remember = true);''')
needle='''ExternalProtocolDialog::ExternalProtocolDialog(
    WebContents* web_contents,''';extra='''// This path is entered only after Chromium's normal block, anti-flood and
// default-handler checks, but never offers a persistent bypass of consent.
void ExternalProtocolHandler::RunBlancExternalProtocolDialog(
    const GURL& url, WebContents* web_contents,
    ui::PageTransition ignored_page_transition, bool ignored_has_user_gesture,
    bool ignored_is_in_fenced_frame_tree,
    const std::optional<url::Origin>& initiating_origin,
    content::WeakDocumentPtr initiator_document,
    const std::u16string& program_name) {
  if (!web_contents || program_name.empty()) return;
  new ExternalProtocolDialog(web_contents, url, program_name, initiating_origin,
                             std::move(initiator_document), false);
}

''';replace(dc,needle,extra+needle)
needle='''    content::WeakDocumentPtr initiator_document)
    : web_contents_''';replace(dc,needle,'''    content::WeakDocumentPtr initiator_document, bool allow_remember)
    : web_contents_''')
needle='''  bool show_remember_selection_checkbox =
      profile->GetPrefs()->GetBoolean(''';replace(dc,needle,'''  bool show_remember_selection_checkbox =
      allow_remember && profile->GetPrefs()->GetBoolean(''')
for rel in paths:
 p=stage/rel;print(rel,hashlib.sha256(p.read_bytes()).hexdigest())
