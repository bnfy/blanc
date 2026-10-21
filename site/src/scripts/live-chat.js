// Loads Crisp only after the visitor asks for live chat, so no Crisp
// script, request or cookie reaches anyone who never opens it. Without
// JavaScript every trigger stays an ordinary email link.
const triggers = [...document.querySelectorAll("[data-live-chat]")];
const bubble = document.querySelector("[data-live-chat-bubble]");

function openChat(websiteId) {
  if (!window.$crisp) {
    window.$crisp = [
      ["safe", true],
      // Open on the left, where the bubble sits, clear of the newsletter card.
      ["config", "position:reverse", [true]],
      // Crisp brings its own launcher; retire ours once it is on screen.
      ["on", "session:loaded", () => bubble?.remove()],
    ];
    window.CRISP_WEBSITE_ID = websiteId;
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.append(script);
  }
  window.$crisp.push(["do", "chat:open"]);
}

for (const trigger of triggers) {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openChat(trigger.dataset.liveChat);
  });
}
