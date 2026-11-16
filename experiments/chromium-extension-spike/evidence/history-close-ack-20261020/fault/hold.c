#include <unistd.h>
#include <fcntl.h>
#include <sys/syscall.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdarg.h>
#include <stdint.h>
static int target(const char*path,char*mode){const char*r=getenv("BLANC_SPACE_WRITE_BARRIER");char prefix[4096],arm[4096];if(!r)return 0;snprintf(prefix,sizeof(prefix),"%s/profile/Default/",r);if(strncmp(path,prefix,strlen(prefix)))return 0;snprintf(arm,sizeof(arm),"%s/arm",r);int f=open(arm,O_RDONLY);if(f<0)return 0;ssize_t n=read(f,mode,63);close(f);if(n<=0)return 0;mode[n]=0;int backup=strstr(mode,"backup")!=NULL;return strstr(path+strlen(prefix),"/Tabs_")!=NULL;}
static void record(const char*path,const char*mode,const char*op){char name[4096],b[5000];const char*r=getenv("BLANC_SPACE_WRITE_BARRIER");snprintf(name,sizeof(name),"%s/error.json",r);int f=open(name,O_WRONLY|O_CREAT|O_TRUNC,0600);int n=snprintf(b,sizeof(b),"{\"pid\":%d,\"path\":\"%s\",\"mode\":\"%s\",\"op\":\"%s\",\"errno\":%d}",getpid(),path,mode,op,strstr(mode,"enospc")?ENOSPC:EIO);if(f>=0){syscall(SYS_write,f,b,n);close(f);}snprintf(name,sizeof(name),"%s/events.jsonl",r);f=open(name,O_WRONLY|O_CREAT|O_APPEND,0600);if(f>=0){syscall(SYS_write,f,b,n);syscall(SYS_write,f,"\n",1);close(f);}}
static int hookfcntl(int f,int cmd,...){uintptr_t arg=0;switch(cmd){case F_GETFD:case F_GETFL:case F_GETOWN:case F_FULLFSYNC:case F_BARRIERFSYNC:break;default:{va_list a;va_start(a,cmd);arg=va_arg(a,uintptr_t);va_end(a);}}if((cmd==F_BARRIERFSYNC || cmd==F_FULLFSYNC)){char path[4096],mode[64];if(!syscall(SYS_fcntl,f,F_GETPATH,path)&&target(path,mode)&&strstr(mode,"flush")){record(path,mode,"F_BARRIERFSYNC");errno=EIO;return -1;}}return syscall(SYS_fcntl,f,cmd,arg);}
static int hooksync(int f){char path[4096],mode[64];if(!syscall(SYS_fcntl,f,F_GETPATH,path)&&target(path,mode)&&strstr(mode,"flush")){record(path,mode,"fsync");errno=EIO;return -1;}return syscall(SYS_fsync,f);}
static int hookrename(const char*from,const char*to){char mode[64];if(target(to,mode)&&strstr(mode,"rename")){record(to,mode,"rename");errno=EIO;return -1;}return syscall(SYS_rename,from,to);}
static ssize_t hookwrite(int f,const void*b,size_t n){char path[4096],mode[64];if(!syscall(SYS_fcntl,f,F_GETPATH,path)&&target(path,mode)&&strstr(mode,"write")){record(path,mode,"write");errno=strstr(mode,"enospc")?ENOSPC:EIO;return -1;}return syscall(SYS_write,f,b,n);}
static int hookunlink(const char*path){char mode[64];if(target(path,mode)&&strstr(mode,"ack")){record(path,mode,"unlink");errno=EIO;return -1;}return syscall(SYS_unlink,path);}
static int hookunlinkat(int fd,const char*path,int flags){char mode[64];if(target(path,mode)&&strstr(mode,"ack")){record(path,mode,"unlinkat");errno=EIO;return -1;}return unlinkat(fd,path,flags);}
__attribute__((used,section("__DATA,__interpose")))static struct{const void*a;const void*b;}i[]={{(void*)hookunlinkat,(void*)unlinkat},{(void*)hookwrite,(void*)write},{(void*)hookunlink,(void*)unlink},{(void*)hookfcntl,(void*)fcntl},{(void*)hooksync,(void*)fsync},{(void*)hookrename,(void*)rename}};
