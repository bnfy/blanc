#include <unistd.h>
#include <fcntl.h>
#include <sys/syscall.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
static void hold(int fd){const char*r=getenv("BLANC_HISTORY_HOLD");if(!r)return;char p[4096],prefix[4096],release[4096],mark[4096];if(syscall(SYS_fcntl,fd,F_GETPATH,p))return;snprintf(prefix,sizeof(prefix),"%s/profile/Default/Sessions/Tabs_",r);if(strncmp(p,prefix,strlen(prefix)))return;snprintf(release,sizeof(release),"%s/release",r);if(access(release,F_OK)==0)return;snprintf(mark,sizeof(mark),"%s/held",r);int f=open(mark,O_WRONLY|O_CREAT|O_TRUNC,0600);if(f>=0){syscall(SYS_write,f,p,strlen(p));close(f);}for(int i=0;i<600&&access(release,F_OK)!=0;i++)usleep(100000);}
static ssize_t heldread(int fd,void*b,size_t n){hold(fd);return syscall(SYS_read,fd,b,n);}
static ssize_t heldpread(int fd,void*b,size_t n,off_t o){hold(fd);return syscall(SYS_pread,fd,b,n,o);}
__attribute__((used,section("__DATA,__interpose")))static struct{const void*a;const void*b;}i[]={{(void*)heldread,(void*)read},{(void*)heldpread,(void*)pread}};
