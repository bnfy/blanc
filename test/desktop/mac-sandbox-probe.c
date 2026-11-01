// Read-only qualification probe, never packaged into the application.
#include <sys/types.h>
#include <stdlib.h>
#include <stdio.h>
extern int sandbox_check(pid_t, const char *, int, ...);
extern const int SANDBOX_CHECK_NO_REPORT;
int main(int argc, char **argv) {
  if (argc != 3) return 2;
  pid_t pid = (pid_t)atoi(argv[1]);
  int active = sandbox_check(pid, NULL, 0);
  int file = sandbox_check(pid, "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, argv[2]);
  int exec = sandbox_check(pid, "process-exec", 1 | SANDBOX_CHECK_NO_REPORT, "/usr/bin/true");
  int fork = sandbox_check(pid, "process-fork", SANDBOX_CHECK_NO_REPORT);
  printf("{\"sandboxed\":%d,\"canaryRead\":%d,\"processExec\":%d,\"processFork\":%d}\n", active, file, exec, fork);
  return 0;
}
