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
  const char *expected = getenv("BLANC_ECS_CDM_EXECUTABLE");
  char *library = cdm ? strdup(cdm) : NULL;
  char executable[4096];
  ssize_t executable_size = readlink("/proc/self/exe", executable, sizeof(executable) - 1);
  int own_core = expected && executable_size > 0 && executable_size < (ssize_t)sizeof(executable) - 1;
  if (own_core) { executable[executable_size] = '\0'; own_core = !strcmp(executable, expected); }
  // The loaded library remains mapped; no subprocess needs this environment.
  unsetenv("LD_PRELOAD");
  unsetenv("BLANC_ECS_CDM_PRELOAD_PATH");
  unsetenv("BLANC_ECS_CDM_EXECUTABLE");
  if (!own_core || !library || !*library) { free(library); return; }
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
  if (!zygote || unsandboxed) { free(library); return; }
  if (library[0] != '/' || !dlopen(library, RTLD_NOW | RTLD_LOCAL)) {
    fputs("Candidate CDM pre-sandbox preload failed\n", stderr);
    _exit(126);
  }
  free(library);
}
