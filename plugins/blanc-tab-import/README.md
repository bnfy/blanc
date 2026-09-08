# Blanc open-tab handoff plugin

This is the live-window handoff entry path. It supplements Blanc's in-app
Bring Your Tabs migration and organizer; it does not replace or replicate that
saved-session workflow.

This package gives ChatGPT/Codex a narrow workflow for copying one Chrome,
Edge, Brave, Opera, or Vivaldi window into Blanc. It exposes one remote MCP
tool, `create_tab_handoff`, and the `import-open-tabs` skill.

The tool stores an encrypted envelope for ten minutes and returns a landing
page link whose fragment carries the decryption capability. It requires no
Blanc account or custom authentication.

The production OpenAI app registration is intentionally not represented by a
fake `.app.json` ID. After the deployed MCP endpoint passes domain verification
and receives its real `plugin_asdk_app_…` identifier, the submission package
can add that registered app mapping without changing the tool contract.
