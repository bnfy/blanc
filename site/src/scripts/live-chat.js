// Loads Crisp only after the visitor asks for live chat, so no Crisp
// script, request or cookie reaches anyone who never opens it. The one
// exception is a visitor who has chatted before in this browser: Crisp's own
// session cookie is still there, so Crisp loads (closed) to show a reply that
// arrived after they left. Without JavaScript every trigger stays an
// ordinary email link.
const triggers = [...document.querySelectorAll("[data-live-chat]")];
const bubble = document.querySelector("[data-live-chat-bubble]");
// Open on the left, where the bubble sits, clear of the newsletter card.
const LEFT = ["config", "position:reverse", [true]];
let ready = false;

let openWhenReady = false;

// Crisp keeps a visitor's conversation in a cookie named
// crisp-client/session/<website ID> (URL-encoded in document.cookie).
function hasCrispSession(websiteId) {
  const name = `crisp-client/session/${websiteId}`;
  return document.cookie.split(";").some((pair) => {
    const key = pair.split("=")[0].trim();
    try {
      return decodeURIComponent(key) === name;
    } catch {
      return false;
    }
  });
}

function openChat(websiteId) {
  if (ready) {
    window.$crisp.push(["do", "chat:open"]);
    return;
  }
  openWhenReady = true;
  loadCrisp(websiteId);
}

function loadCrisp(websiteId) {
  if (window.$crisp) return; // already loading; session:loaded takes over
  window.$crisp = [
    ["safe", true],
    LEFT,
    [
      "on",
      "session:loaded",
      () => {
        // The workspace's own chatbox position arrives with the session and
        // overrides the one queued above, so set it again before opening.
        window.$crisp.push(LEFT);
        if (openWhenReady) window.$crisp.push(["do", "chat:open"]);
        // Crisp brings its own launcher; retire ours.
        bubble?.remove();
        ready = true;
      },
    ],
  ];
  window.CRISP_WEBSITE_ID = websiteId;
  const script = document.createElement("script");
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  document.head.append(script);
}

for (const trigger of triggers) {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openChat(trigger.dataset.liveChat);
  });
}

const websiteId = triggers[0]?.dataset.liveChat;
if (websiteId && hasCrispSession(websiteId)) loadCrisp(websiteId);
