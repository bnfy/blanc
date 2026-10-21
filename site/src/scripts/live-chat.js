// Loads Crisp only after the visitor asks for live chat, so no Crisp
// script, request or cookie reaches anyone who never opens it. Without
// JavaScript every trigger stays an ordinary email link.
const triggers = [...document.querySelectorAll("[data-live-chat]")];
const bubble = document.querySelector("[data-live-chat-bubble]");
// Open on the left, where the bubble sits, clear of the newsletter card.
const LEFT = ["config", "position:reverse", [true]];
let ready = false;

function openChat(websiteId) {
  if (ready) {
    window.$crisp.push(["do", "chat:open"]);
    return;
  }
  if (window.$crisp) return; // still loading; session:loaded opens it
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
        window.$crisp.push(["do", "chat:open"]);
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
