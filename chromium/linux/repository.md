# Linux package repository

Preview packages (`blanc-prototype`) use staging at `https://pkg-staging.blanc.day`.
Only `blanc-beta` uses production at `https://pkg.blanc.day`. Both hosts are planned
for L3. Until then, `apt update` warns on machines with a preview installed.

| Source | Staging | Production |
| --- | --- | --- |
| apt | `deb [arch=<arch> signed-by=<keyring>] https://pkg-staging.blanc.day/deb stable main` | `deb [arch=<arch> signed-by=<keyring>] https://pkg.blanc.day/deb stable main` |
| dnf `mirrorlist` | `https://pkg-staging.blanc.day/rpm/stable/$basearch/mirrorlist` | `https://pkg.blanc.day/rpm/stable/$basearch/mirrorlist` |

Under `deb/`, apt indexes live in `dists/stable/main/binary-{amd64,arm64}/` and
packages in `pool/main/b/<package>/`. Each dnf directory under
`rpm/stable/{x86_64,aarch64}/` holds RPMs and a `repodata/` directory.

After approval, the owner signs on the owner's Mac only. For apt, the owner
signs `Release` to produce `InRelease` and `Release.gpg`. For dnf, the owner
signs each `.rpm` and produces `repodata/repomd.xml.asc` for the metadata.

Fingerprint: 50D361974F477C8C87E117BD95AE97ABCACFEE6C

## Repository clients

DNF needs the `mirrorlist` above in the installed and manual `.repo` files,
with `gpgcheck=1`, `repo_gpgcheck=1`, and the committed key. Each response
names a single generation URL. DNF uses that mirror for both `repomd.xml` and
its detached signature. A fixed `baseurl` resolving the two requests against
the current pointer can return a mismatched pair during publication. Task 3
must carry the mirrorlist into the package configuration. [librepo signature download](https://github.com/rpm-software-management/librepo/blob/1.17.0/librepo/yum.c#L432-L482)

Apt uses `InRelease` and `Acquire-By-Hash`. Its SHA-256 index URLs continue
to work after a switch. Both hosts serve the public key at `/blanc-repository.asc`.

## Owner and runner handoff

Run the commands below from the repository root. The Mac needs GnuPG, RPM
(including `rpmsign` and `rpmkeys`), `dpkg-deb` (Homebrew `dpkg`), Python 3.10+
with `rpmrepo-metadata==0.9.1`, Node 22, 1Password CLI, and a
local encrypted temporary volume. Each signing run opens the Dev vault. It
streams the key and passphrase from the items made by `make-repository-key.command`,
stops the temporary agent, overwrites its private key files and removes the
temporary directory. Filesystem snapshots and SSDs limit overwrite guarantees.

Install the RPM header reader in the signing Python environment with
`python3 -m pip install --only-binary=:all: --no-deps rpmrepo-metadata==0.9.1`.

Register the signing Mac once, from that Mac. The owner commands compare its
hardware UUID with this user-local Git setting before opening the vault or the
uploader. Keep the setting local.

```sh
git config --global blanc.linuxRepositoryOwnerUUID \
  "$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F '"' '/"IOPlatformUUID" =/ {print $(NF-1)}')"
```

1. Put the four build-checked candidate tarballs in `CANDIDATES`. From the
   digests selected during build-check, write `ARCHIVE_SHA256SUMS` with one
   line per archive in the form `<sha256>  blanc-linux-beta-<arch>-<build>-candidate.tar.gz`.
   Run `chromium/linux/owner/sign-candidate.command beta ARCHIVE_SHA256SUMS CANDIDATES APPROVED`.
   The signer checks the tarball bytes, candidate manifest, executable and both
   packages for each architecture and build. All four must share a source commit.
   An existing handoff of eight individually build-checked packages can also use
   `chromium/linux/owner/repository-approve.command VERIFIED_PACKAGES APPROVED`.
   It signs copies of all four RPMs, checks them against an isolated RPM key
   database, then signs `approved-packages.json`. Its eight rows bind filename,
   SHA-256 and byte size. The newer of the two versions is `releaseVersion`.
2. Transfer the eight files, `approved-packages.json` and
   `approved-packages.json.asc` as individual assets on the existing private
   `fork-linux-candidate` draft. Dispatch `chromium-linux-candidate.yml` on
   `chromium/next` with `check=repo-metadata` and `sha256` equal to the digest
   of the approval JSON. The job verifies the signature and every input, then
   indexes only `releaseVersion`. The artifact carries the indexes and their
   tree inventory. Keep the approved package copies on the Mac. Download and extract the
   `linux-repo-metadata-<sha256>` workflow artifact into `UNSIGNED`.
   Omitting `sha256` runs the fixture checks alone.
3. Run `chromium/linux/owner/repository-sign.command APPROVED UNSIGNED SIGNED`.
   The Mac reconstructs the tree with its approved packages and repository key.
   It verifies package bytes and RPM signatures, compares apt control fields and
   RPM dependencies and file provides to the package headers, checks the Release
   and repomd checksum chains, and signs their roots. Its detached signature
   on `signed-tree.json` authenticates the upload inventory. The tree digest
   hashes the sorted lines `<lowercase SHA-256>  <relative path>\n` for every
   public file, including the metadata signatures.
4. From `chromium/linux/repository/worker` run `npm ci` once and sign in with
   `npx wrangler login`. Back at the root, run
   `chromium/linux/owner/repository-upload.command staging SIGNED GENERATION`.
   The generation must match the fourth version component of every signed package.
   The release tool records the
   staging update proof against the tree digest. The release tool runs
   `chromium/linux/owner/repository-upload.command production SIGNED GENERATION PROVEN_DIGEST PREDECESSOR_JSON`.
   It passes the complete production pointer recorded in the release journal, or
   `null` for the first publication. The uploader compares it under the lock.
   Both commands use Wrangler's authenticated remote R2 binding.

In Task 8 the owner provisions both buckets and fills in the following
placeholders in `repository/worker/wrangler.toml` before deploying each environment.

| Placeholder | Value |
| --- | --- |
| `REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID` | ID of the account hosting the buckets and the blanc.day zone |
| `REPLACE_WITH_STAGING_BUCKET` | `blanc-linux-packages-staging` |
| `REPLACE_WITH_PRODUCTION_BUCKET` | `blanc-linux-packages` |

The `PACKAGES` binding and custom-domain routes are already specified for
`pkg-staging.blanc.day` and `pkg.blanc.day`.

## Publication and recovery

The publisher conditionally creates `publisher.lock` in the target bucket,
checks any existing immutable object, uploads packages, then writes signed
metadata and a retention inventory under `generations/<n>/`. Its last write
publishes `current.json` with the generation, tree digest and two previous
generation numbers. It reads every public file back through the target
domain before pruning. Each package and architecture keeps its newest three
versions plus every package referenced by those three generations.
[R2 conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations)

After an interruption, resume with the same signed tree, generation and target.
A matching current pointer resumes at public verification. A different tree
at that generation or a lower generation is refused. After a killed process,
check that the publisher has exited and reconcile the current pointer with
the release journal before removing its stale lock. Locks have no timer.

## Key rotation

The key expires on 2028-11-21. One year before expiry, extend the same key and
republish its public half. The packages' cron jobs reinstall it.

If the key is compromised, stop signing with it immediately and publish the
revocation certificate in the repository root and in Git. Publish the replacement
fingerprint on blanc.day over HTTPS and in a Git commit signed with an independent
key. Testers install the replacement key by hand after checking that fingerprint,
or install it from a package they verify against the fingerprint. Trust in the
compromised key ends immediately, with no overlap.
