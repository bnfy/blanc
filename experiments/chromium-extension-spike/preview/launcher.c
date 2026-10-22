// Local preview packaging entry point. Never uses a shipping/default Chromium profile.
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  char exe[PATH_MAX], resolved[PATH_MAX], browser[PATH_MAX], ui[PATH_MAX], blocker[PATH_MAX], profile[PATH_MAX], contents[PATH_MAX];
  uint32_t size = sizeof(exe);
  if (_NSGetExecutablePath(exe, &size) || !realpath(exe, resolved)) return 70;
  char *slash = strrchr(resolved, '/'); if (!slash) return 70; *slash = 0;
  strcpy(contents,resolved); slash=strrchr(contents,'/'); if (!slash) return 70; *slash=0;
  const char *home = getenv("HOME"); if (!home || home[0] != '/') return 70;
  if (snprintf(browser,sizeof(browser),"%s/Blanc Prototype",resolved) >= (int)sizeof(browser) ||
      snprintf(ui,sizeof(ui),"--blanc-prototype-assets=%s/Resources/BlancAssets",contents) >= (int)sizeof(ui) ||
      snprintf(blocker,sizeof(blocker),"--blanc-blocker-assets=%s/Resources/BlancBlocker",contents) >= (int)sizeof(blocker) ||
      snprintf(profile,sizeof(profile),"--user-data-dir=%s/Library/Application Support/Blanc Chromium Preview",home) >= (int)sizeof(profile)) return 70;
  char **args = calloc((size_t)argc + 7, sizeof(char *)); if (!args) return 70;
  int n=0; args[n++]=browser; args[n++]=ui; args[n++]=blocker; args[n++]=profile;
  args[n++]="--no-default-browser-check";
  for(int i=1;i<argc;i++) {
    // Assets must always come from this sealed bundle. Explicit profile overrides
    // remain available for controlled isolation tests, like Chromium's CLI.
    if (!strncmp(argv[i],"--blanc-prototype-assets",23) || !strncmp(argv[i],"--blanc-blocker-assets",21)) return 64;
    args[n++]=argv[i];
  }
  execv(browser,args); perror("Blanc Chromium Preview"); return 71;
}
