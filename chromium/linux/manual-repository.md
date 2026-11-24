# Blanc Beta’s Linux repository

Installing the downloaded package adds Blanc’s repository during installation. The daily
job maintains the signing key for that source. When a new beta is available, apt or dnf
offers it with your system updates.

## Turn off automatic repository setup

To install the package without adding a repository, run this before installation.
It also works on an existing installation. The last two settings in the defaults file
give you control of the source and its key across upgrades.

```sh
sudo tee -a /etc/default/blanc-beta >/dev/null <<'DEFAULTS'

repo_add_once="false"
repo_managed="false"
DEFAULTS
```

## Disable an existing source

After turning off automatic setup above, remove the source and its standalone key files.
Future updates from Blanc stop appearing. RPM retains its imported public certificate.

```sh
sudo rm -f /etc/apt/sources.list.d/blanc-beta.list /etc/yum.repos.d/blanc-beta.repo \
  /usr/share/keyrings/blanc-beta.gpg /usr/share/keyrings/blanc-beta.asc
```

## Download and verify the key

For manual setup, turn off automatic setup first. Run this block and check that it
succeeds before continuing with the commands for your distribution.

```sh
(
  set -eu
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  curl --fail --silent --show-error https://pkg.blanc.day/blanc-repository.asc -o "$work/key.asc"
  fingerprint=$(gpg --batch --with-colons --show-keys "$work/key.asc" |
    awk -F: '$1 == "pub" { primary=1 } $1 == "fpr" && primary { print $10; primary=0 }')
  if [ "$fingerprint" != "50D361974F477C8C87E117BD95AE97ABCACFEE6C" ]; then
    echo 'Unexpected Blanc repository signing key' >&2
    exit 1
  fi
  sudo install -d -m 0755 /usr/share/keyrings
  sudo install -m 0644 "$work/key.asc" /usr/share/keyrings/blanc-beta.asc
)
```

## Debian and Ubuntu

```sh
(
  set -eu
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  gpg --dearmor --output "$work/key.gpg" /usr/share/keyrings/blanc-beta.asc
  sudo install -m 0644 "$work/key.gpg" /usr/share/keyrings/blanc-beta.gpg
  printf 'deb [arch=%s signed-by=/usr/share/keyrings/blanc-beta.gpg] https://pkg.blanc.day/deb stable main\n' \
    "$(dpkg --print-architecture)" | sudo tee /etc/apt/sources.list.d/blanc-beta.list >/dev/null
  sudo apt-get update
)
```

Install the browser with `sudo apt-get install blanc-beta`.

## Fedora

```sh
(
  set -eu
  sudo rpm --import /usr/share/keyrings/blanc-beta.asc
  sudo tee /etc/yum.repos.d/blanc-beta.repo >/dev/null <<'REPO'
[blanc-beta]
name=Blanc Beta
mirrorlist=https://pkg.blanc.day/rpm/stable/$basearch/mirrorlist
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=file:///usr/share/keyrings/blanc-beta.asc
REPO
  sudo dnf --repo=blanc-beta --refresh -y makecache
)
```

Install the browser with `sudo dnf install blanc-beta`.
