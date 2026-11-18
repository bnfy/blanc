# Signing the Windows preview

W1 Part C (`docs/superpowers/plans/2026-11-17-windows-fork-w1.md`). Owner
decision, 2026-11-17: preview builds are signed now, with the Bananify Creative
certificate (Azure Trusted Signing), to prove the path early. A signed preview
has test hooks compiled in, so it lives only on the runner and on the
unpublished draft release `fork-windows-candidate`; it is never published, never
an Actions artifact, and the build server never receives a credential.

## How a signed installer is made

Chromium's installer, `mini_installer.exe`, carries the browser as two
resources: `B7`/`CHROME.PACKED.7Z` (the browser's files, `Chrome-bin`, inside
`chrome.7z`, inside an LZMA 7z) and `BL`/`SETUP.EX_` (`setup.exe` as an LZX
cabinet), both language 1033. The files inside must be signed before the
installer is, so on a Windows runner:

1. `chromium/windows/repack-installer.ps1 -Phase unpack` takes the installer
   apart with Chromium's own `resedit.py` (staged by the build in
   `signing\mini_installer`, run through `resedit-py3.py`, which supplies the
   Python 2 name it still uses), 7-Zip and `expand.exe`.
2. Every `.exe` and `.dll` in `Chrome-bin`, and `setup.exe`, is signed.
3. `-Phase pack` puts them back: `chrome.7z` stored, `chrome.packed.7z` with
   LZMA and no timestamp, `setup.ex_` with `makecab`, and `resedit.py --update`
   into a copy of the installer, as `create_installer_archive.py` builds them.
4. The repacked installer is signed.
5. Every signature is checked: valid, timestamped, and its subject equal to
   `WINDOWS_EXPECTED_PUBLISHER`, as the Electron release checks its own.
6. The signed installer goes through the install check
   (`chromium/tests/windows-install.mjs --installer=…`) before it is kept.

The unsigned dry run of steps 1, 3 and 6 passed on 2026-11-18
(`chromium-windows-candidate.yml` run 44239586219): the repacked installer
installed and uninstalled beside Electron Blanc 1.49.1, 11 of 11 checks, and
the installed files carried the build's hashes.

The first signed installer passed on 2026-11-18 (run 44316018075, approved
by the owner): 13 files inside and the installer signed, 14 signatures
verified, and the install check 11 of 11 with `--signed`, which accepts the
installed `chrome.exe` and `chrome.dll` only when they are the candidate's own
files with an Authenticode signature added (`signedCopyOf` in `candidate.mjs`:
the checksum, the security directory entry and the certificate table after
alignment padding are the only differences). Without it the harness refuses
them, because signing changes their hashes; that is why the first signing run,
44313102558, failed. The signed installer and `windows-signature.json` are on
the draft release `fork-windows-candidate`; the run's Actions artifact holds no
executable.

## Credentials and approval

The signing job runs in the GitHub environment `fork-windows-signing`, which
the owner creates with themselves as required reviewer, so every signing run
waits for their approval. It uses the repository's existing Azure Trusted
Signing secrets and variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_ENDPOINT`,
`AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME`,
`WINDOWS_EXPECTED_PUBLISHER`) exactly as `release-windows-linux.yml` does,
through Microsoft's `TrustedSigning` PowerShell module (pinned version), and
fails closed when any is missing.

Those secrets are repository-wide today, so the environment's review is what
gates them for this job; it does not stop another workflow from reading them.
Moving them into environments is a separate change for the Electron release
too.

## Open

- Nothing for the preview: since W2 A1 the version resources of `chrome.exe`,
  `chrome.dll`, `setup.exe` and the installer name Bananify Creative, from
  `blanc/branding/win/BRANDING` (the Windows args' `branding_file_path`), so
  the signature and the file properties agree.
