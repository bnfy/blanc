# Linux package repository

Preview packages (`blanc-prototype`) use staging at `https://pkg-staging.blanc.day`.
Only `blanc-beta` uses production at `https://pkg.blanc.day`. Both hosts are planned
for L3. Until then, `apt update` warns on machines with a preview installed.

| Source | Staging | Production |
| --- | --- | --- |
| apt | `deb [arch=<arch> signed-by=<keyring>] https://pkg-staging.blanc.day/deb stable main` | `deb [arch=<arch> signed-by=<keyring>] https://pkg.blanc.day/deb stable main` |
| dnf `baseurl` | `https://pkg-staging.blanc.day/rpm/stable/$basearch` | `https://pkg.blanc.day/rpm/stable/$basearch` |

Under `deb/`, apt indexes live in `dists/stable/main/binary-{amd64,arm64}/` and
packages in `pool/main/b/<package>/`. Each dnf directory under
`rpm/stable/{x86_64,aarch64}/` holds RPMs and a `repodata/` directory.

After approval, the owner signs on the owner's Mac only. For apt, the owner
signs `Release` to produce `InRelease` and `Release.gpg`. For dnf, the owner
signs each `.rpm` and produces `repodata/repomd.xml.asc` for the metadata.

Fingerprint: (pending the owner's key run)

## Key rotation

The key expires on 2028-11-21. One year before expiry, extend the same key and
republish its public half. The packages' cron jobs reinstall it.

If the key is compromised, stop signing with it immediately and publish the
revocation certificate in the repository root and in Git. Publish the replacement
fingerprint on blanc.day over HTTPS and in a Git commit signed with an independent
key. Testers install the replacement key by hand after checking that fingerprint,
or install it from a package they verify against the fingerprint. Trust in the
compromised key ends immediately, with no overlap.
