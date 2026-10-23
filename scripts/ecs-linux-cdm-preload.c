// Candidate-only equivalent of Chromium's pre-sandbox library preload.
// No symbol interposition: load (but do not initialize) the installed CDM only
// in the generic zygote, before Chromium enters its existing kernel sandbox.
#include <dlfcn.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

__attribute__((constructor)) static void preload_cdm_in_zygote(void) {
  const char *cdm = getenv("BLANC_ECS_CDM_PRELOAD_PATH");
  if (!cdm || !*cdm) return; // First installation still needs a restart.
  char args[65536];
  int fd = open("/proc/self/cmdline", O_RDONLY | O_CLOEXEC);
  if (fd < 0) _exit(126);
  ssize_t size = read(fd, args, sizeof(args) - 1);
  close(fd);
  if (size <= 0 || size == (ssize_t)sizeof(args) - 1) _exit(126);
  args[size] = '\0';
  int zygote = 0, unsandboxed = 0;
  for (ssize_t at = 0; at < size; at += (ssize_t)strlen(args + at) + 1) {
    if (!strcmp(args + at, "--type=zygote")) zygote = 1;
    if (!strcmp(args + at, "--no-zygote-sandbox") || !strcmp(args + at, "--no-sandbox")) unsandboxed = 1;
  }
  if (!zygote || unsandboxed) return;
  if (cdm[0] != '/' || !dlopen(cdm, RTLD_NOW | RTLD_LOCAL)) {
    fputs("Candidate CDM pre-sandbox preload failed\n", stderr);
    _exit(126);
  }
}
