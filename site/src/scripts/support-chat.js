// Loads Crisp only after the visitor asks for live chat, so no Crisp
// script, request or cookie reaches anyone who never opens it. Without
// JavaScript the card stays an ordinary email link.
const trigger = document.querySelector("[data-live-chat]");
if (trigger) {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (!window.$crisp) {
      window.$crisp = [["safe", true]];
      window.CRISP_WEBSITE_ID = trigger.dataset.liveChat;
      const script = document.createElement("script");
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      document.head.append(script);
    }
    window.$crisp.push(["do", "chat:open"]);
  });
}
