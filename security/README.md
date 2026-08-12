# Security controls and data-flow inventory

`network-data-inventory.json` is the machine-checked inventory of app-initiated
and Blanc-site network flows. Any new endpoint, third-party recipient,
persistent identifier, or network-affecting default must update this file and
the public privacy policy in the same change.

`test/unit/security-controls.test.js` guards the inventory, public site headers,
opt-in defaults, Electron fuses, retired credential SDK, and commit-pinned
GitHub Actions. It is intentionally a drift check, not a substitute for threat
modeling or dynamic testing.
