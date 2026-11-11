#!/usr/bin/env bash
set -euo pipefail
# Points apt on a GitHub-hosted Linux runner away from its default mirror,
# azure.archive.ubuntu.com, which failed to resolve on November 11, 2026 and
# stopped every job that installs packages. apt still checks every package
# against Ubuntu's archive keys; only the download host changes. The release
# workflow does the same inline (#1449), because its runs check out a tag.
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]]; then
  echo 'The apt mirror is only changed on disposable GitHub Linux runners.' >&2
  exit 1
fi
if [ -f /etc/apt/apt-mirrors.txt ]; then
  printf '%s\n' http://mirrors.edge.kernel.org/ubuntu/ http://archive.ubuntu.com/ubuntu/ | sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  if [ -f "$file" ]; then
    sudo sed -E -i 's#https?://azure\.archive\.ubuntu\.com/ubuntu/?#http://mirrors.edge.kernel.org/ubuntu/#g' "$file"
  fi
done
if grep -rqs 'azure\.archive\.ubuntu\.com' /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d; then
  echo "azure.archive.ubuntu.com is still configured" >&2
  exit 1
fi
echo 'Acquire::Retries "5";' | sudo tee /etc/apt/apt.conf.d/80-blanc-retries >/dev/null
