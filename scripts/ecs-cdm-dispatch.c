// Isolated macOS ECS experiment. No code injection, DYLD override, or new
// entitlement: route only Chromium's sandboxed CDM service to the existing
// Plugin helper. Other services keep the original library-validated launcher.
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static int is_cdm(int argc, char **argv) {
  int type = 0, subtype = 0, sandbox = 0, seatbelt = 0;
  for (int i = 1; i < argc; i++) {
    const char *arg = argv[i];
    if (!strncmp(arg, "--type", 6)) {
      if (strcmp(arg, "--type=utility") || type++) return 0;
    } else if (!strncmp(arg, "--utility-sub-type", 18)) {
      if (strcmp(arg, "--utility-sub-type=media.mojom.CdmServiceBroker") || subtype++) return 0;
    } else if (!strncmp(arg, "--service-sandbox-type", 22)) {
      if (strcmp(arg, "--service-sandbox-type=cdm") || sandbox++) return 0;
    } else if (!strncmp(arg, "--seatbelt-client=", 18)) {
      if (!arg[18] || seatbelt++) return 0;
      for (const char *c = arg + 18; *c; c++) if (*c < '0' || *c > '9') return 0;
    } else if (!strncmp(arg, "--no-sandbox", 12) ||
               !strncmp(arg, "--disable-sandbox", 17) ||
               !strncmp(arg, "--no-zygote-sandbox", 19)) return 0;
  }
  return type == 1 && subtype == 1 && sandbox == 1 && seatbelt == 1;
}

int main(int argc, char **argv) {
  if (argc < 1 || !argv) return 126;
  char raw[PATH_MAX], source[PATH_MAX], destination[PATH_MAX];
  uint32_t size = sizeof(raw);
  if (_NSGetExecutablePath(raw, &size) || !realpath(raw, source)) return 126;
  const char suffix[] = "/Blanc Helper.app/Contents/MacOS/Blanc Helper";
  size_t length = strlen(source), tail = strlen(suffix);
  if (length <= tail || strcmp(source + length - tail, suffix)) return 126;
  source[length - tail] = '\0';
  const char *target = is_cdm(argc, argv)
    ? "/Blanc Helper (Plugin).app/Contents/MacOS/Blanc Helper (Plugin)"
    : "/Blanc Helper.app/Contents/MacOS/Blanc Core Helper";
  if (snprintf(destination, sizeof(destination), "%s%s", source, target) >= (int)sizeof(destination)) return 126;
  argv[0] = destination;
  execv(destination, argv);
  perror("ECS helper dispatch failed");
  return 127;
}
