#include "reader_address_policy.h"
#include <arpa/inet.h>
#include <cassert>
#include <iostream>
#include <string>
#include <vector>
using blanc::reader::AreReaderAddressesPublic;
using blanc::reader::IsReaderPublicAddress;
std::vector<uint8_t> Parse(const char* s) {
  std::vector<uint8_t> v(4);
  if (inet_pton(AF_INET,s,v.data())==1) return v;
  v.resize(16);
  if (inet_pton(AF_INET6,s,v.data())==1) return v;
  return {};
}
int main(int argc, char**) {
  if (argc > 1) {
    std::string line;
    while (std::getline(std::cin,line)) std::cout << IsReaderPublicAddress(Parse(line.c_str())) << '\n';
    return 0;
  }
  for (const char* x : {"0.1.2.3","10.1.2.3","100.64.0.1","127.3.0.1","169.254.1.1","172.31.255.1","192.0.0.1","192.0.2.1","192.88.99.1","192.168.0.1","198.19.1.2","198.51.100.2","203.0.113.2","224.0.0.1","255.255.255.255","::","::1","::ffff:8.8.8.8","::ffff:127.0.0.1","64:ff9b::8.8.8.8","64:ff9b:1::1","100::1","2001::1","2001:db8::1","2002::1","fc00::1","fe80::1","fec0::1","ff02::1","invalid"}) assert(!IsReaderPublicAddress(Parse(x)));
  for (const char* x : {"8.8.8.8","1.1.1.1","100.63.255.255","100.128.0.1","172.15.255.255","172.32.0.1","2606:4700:4700::1111","2001:4860:4860::8888"}) assert(IsReaderPublicAddress(Parse(x)));
  auto good=Parse("8.8.8.8"),bad=Parse("127.0.0.1");
  assert(!AreReaderAddressesPublic({}));
  assert(AreReaderAddressesPublic({good,good}));
  assert(!AreReaderAddressesPublic({good,bad}));
  assert(!AreReaderAddressesPublic({good,{}}));
}
