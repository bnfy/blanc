# Page context menu and Glance: source comparison

GitHub's latest published release was rechecked as v1.45.1, with tag and
release target both resolving to `85883b1afa11375e1300130914d6f40c5388af21`.
The three `shipping-*.js` files here are exact copies from that commit.

For a link, shipping builds a native menu containing Open Link in New Tab,
Open Link in Glance, any applicable Space actions, and Copy Link Address.
The Glance action first uses the external-protocol handoff and forbidden
top-level URL checks, then creates an ungrouped tab with the opener's private
state and asks the Glance owner to present it. Shipping also offers page
source only for HTTP(S), and opens it in a new tab to preserve the source
page's history.

The frozen Chromium 158 `render_view_context_menu.cc` (SHA-256
`0344bd88b932d431a80b06d0ece5e1c545d7a10522ae8e861ecede0ffccbe398`)
has a native Open Link in New Tab and Open Link in Split View, but no Glance
menu or command was found in its renderer-context-menu source. Its split
command can navigate an existing inactive split pane, or create and activate a
new split. That is not a safe substitute for the shipping Glance action.
The frozen Blanc UI source (SHA-256
`e8cd2e37af0aeaf73f55d2afeee5afc10344fbb170dd444d68238aadcd67a76e`)
has a temporary split-based Glance foundation and explicitly holds its UI
exposure pending role/focus parity; it is not the shipping floating card.

The appropriate direction is to adapt Chromium's accessible native page
menu for the standard actions and add a Blanc Glance entry only when it can
call a real floating-card owner bound to the originating WebContents and
profile. The command must preserve Chromium's frame-origin, referrer,
navigation and enterprise policy checks as well as Blanc's external-protocol
and forbidden-URL checks. Do not implement it by reusing the split command,
or by resolving the currently focused tab after the menu was opened.

This is source evidence, not proof of the running menu or complete command
behavior. A runtime check must exercise regular and primary-private pages,
background target changes while the menu is open, links in frames, external
and forbidden schemes, existing Glance and split states, extension items,
View Source history, keyboard and accessibility, and the shipping visual
target on each desktop platform. Browser ownership, window-close races,
floating-card behavior and localization remain implementation work. No
application, personal profile, build output or Google baseline was changed.
