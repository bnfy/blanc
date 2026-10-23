// Candidate-only, pre-Electron startup. No shell evaluation, external JSON
// tools, network, or dependency on the previous installation is used here.
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <vector>
#include <algorithm>
#include <stdexcept>
#include <cctype>
#include <cerrno>
#include <cstring>
namespace fs = std::filesystem;
struct Json {
  std::string text;
  std::map<std::string, Json> object;
  bool boolean = false;
  const Json& get(const std::string& key) const {
    static const Json empty;
    auto it = object.find(key); return it == object.end() ? empty : it->second;
  }
};
// Bounded JSON reader; duplicate keys and malformed documents fail closed.
class Parser {
  std::string input; size_t at = 0;
  void space() { while (at < input.size() && std::isspace(static_cast<unsigned char>(input[at]))) ++at; }
  char take() { if (at == input.size()) throw std::runtime_error("truncated JSON"); return input[at++]; }
  unsigned hex4() {
    unsigned n = 0;
    for (int i = 0; i < 4; ++i) {
      char c = take(); int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
      if (digit < 0) throw std::runtime_error("invalid JSON escape");
      n = n * 16 + static_cast<unsigned>(digit);
    }
    return n;
  }
  std::string string() {
    if (take() != '"') throw std::runtime_error("expected JSON string");
    std::string out;
    for (;;) {
      unsigned char c = take();
      if (c == '"') return out;
      if (c < 32) throw std::runtime_error("JSON control character");
      if (c != '\\') { out += c; continue; }
      char escape = take();
      switch (escape) {
        case '"': case '\\': case '/': out += escape; break;
        case 'b': out += '\b'; break; case 'f': out += '\f'; break;
        case 'n': out += '\n'; break; case 'r': out += '\r'; break; case 't': out += '\t'; break;
        case 'u': {
          unsigned code = hex4();
          if (code >= 0xd800 && code <= 0xdbff) {
            if (take() != '\\' || take() != 'u') throw std::runtime_error("missing JSON surrogate");
            unsigned low = hex4();
            if (low < 0xdc00 || low > 0xdfff) throw std::runtime_error("invalid JSON surrogate");
            code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
          } else if (code >= 0xdc00 && code <= 0xdfff) throw std::runtime_error("invalid JSON surrogate");
          if (code == 0) throw std::runtime_error("JSON NUL");
          if (code < 0x80) out += static_cast<char>(code);
          else {
            if (code >= 0x10000) { out += static_cast<char>(0xf0 | (code >> 18)); out += static_cast<char>(0x80 | ((code >> 12) & 63)); }
            else if (code >= 0x800) out += static_cast<char>(0xe0 | (code >> 12));
            else out += static_cast<char>(0xc0 | (code >> 6));
            if (code >= 0x800) out += static_cast<char>(0x80 | ((code >> 6) & 63));
            out += static_cast<char>(0x80 | (code & 63));
          }
          break;
        }
        default: throw std::runtime_error("invalid JSON escape");
      }
    }
  }
  Json value(unsigned depth) {
    if (depth > 32) throw std::runtime_error("JSON nesting limit");
    space(); Json out; char c = take();
    if (c == '"') { --at; out.text = string(); return out; }
    if (c == '{' || c == '[') {
      const char end = c == '{' ? '}' : ']'; space();
      if (at < input.size() && input[at] == end) { ++at; return out; }
      for (;;) {
        space(); std::string key;
        if (c == '{') { key = string(); space(); if (take() != ':') throw std::runtime_error("JSON colon"); }
        Json item = value(depth + 1);
        if (c == '{' && !out.object.emplace(key, item).second) throw std::runtime_error("duplicate JSON key");
        space(); char next = take(); if (next == end) break;
        if (next != ',') throw std::runtime_error("JSON separator");
      }
      return out;
    }
    --at;
    for (const auto& literal : {std::string("true"), std::string("false"), std::string("null")}) {
      if (input.compare(at, literal.size(), literal) == 0) { at += literal.size(); out.boolean = literal == "true"; return out; }
    }
    // Validate JSON numbers even though selection never consumes one.
    size_t start = at;
    if (input[at] == '-') ++at;
    if (at < input.size() && input[at] == '0') ++at;
    else { size_t digits = at; while (at < input.size() && input[at] >= '0' && input[at] <= '9') ++at; if (at == digits) throw std::runtime_error("JSON number"); }
    if (at < input.size() && input[at] == '.') { ++at; size_t digits = at; while (at < input.size() && std::isdigit(static_cast<unsigned char>(input[at]))) ++at; if (digits == at) throw std::runtime_error("JSON fraction"); }
    if (at < input.size() && (input[at] == 'e' || input[at] == 'E')) { ++at; if (at < input.size() && (input[at] == '+' || input[at] == '-')) ++at; size_t digits = at; while (at < input.size() && std::isdigit(static_cast<unsigned char>(input[at]))) ++at; if (digits == at) throw std::runtime_error("JSON exponent"); }
    if (start == at) throw std::runtime_error("invalid JSON");
    return out;
  }
public:
  explicit Parser(std::string data) : input(std::move(data)) {}
  Json parse() { Json result = value(0); space(); if (at != input.size()) throw std::runtime_error("trailing JSON"); return result; }
};
static Json readJson(const fs::path& file) {
  if (!fs::is_regular_file(file) || fs::file_size(file) > 1024 * 1024) throw std::runtime_error("invalid metadata file");
  std::ifstream stream(file); std::string data((std::istreambuf_iterator<char>(stream)), {});
  return Parser(data).parse();
}
static std::string env(const char* key) { const char* result = getenv(key); return result ? result : ""; }
static void set(const char* key, const std::string& value) { if (setenv(key, value.c_str(), 1)) throw std::runtime_error("setenv failed"); }
static bool version(const std::string& text) {
  unsigned dots = 0, digits = 0;
  for (char c : text) { if (c == '.') { if (!digits) return false; ++dots; digits = 0; } else if (c >= '0' && c <= '9' && ++digits <= 9) {} else return false; }
  return dots == 3 && digits > 0;
}
static fs::path component(const fs::path& profile) {
  const auto root = profile / "WidevineCdm";
  if (!fs::exists(root)) return {};
  if (fs::canonical(root) != root) throw std::runtime_error("redirected CDM root");
  std::vector<std::string> versions;
  for (const auto& entry : fs::directory_iterator(root)) if (version(entry.path().filename().string())) versions.push_back(entry.path().filename().string());
  const auto parts = [](const std::string& text) { std::vector<unsigned long> out; size_t at = 0; for (int i = 0; i < 4; ++i) { size_t end = text.find('.', at); out.push_back(std::stoul(text.substr(at, end - at))); at = end + 1; } return out; };
  std::sort(versions.begin(), versions.end(), [&](const auto& a, const auto& b) { return parts(a) > parts(b); });
  const auto prefer = [&](const std::string& selected) {
    auto it = std::find(versions.begin(), versions.end(), selected);
    if (it == versions.end()) return false;
    versions.erase(it); versions.insert(versions.begin(), selected); return true;
  };
  for (const auto& state : {profile / "chromium/Local State", profile / "Local State"}) {
    if (fs::exists(state) && prefer(readJson(state).get("updateclientdata").get("apps").get("oimompecagnajdejgnnjijobebaeigek").get("pv").text)) break;
  }
  const auto hint = root / "latest-component-updated-widevine-cdm";
  if (fs::exists(hint)) {
    fs::path selected = readJson(hint).get("Path").text;
    if (selected.parent_path() != root || !prefer(selected.filename().string())) throw std::runtime_error("invalid active CDM hint");
  }
  for (const auto& name : versions) {
    const auto file = root / name / "_platform_specific/linux_x64/libwidevinecdm.so";
    if (!fs::exists(file)) continue;
    if (fs::canonical(file) != file || !fs::is_regular_file(file)) throw std::runtime_error("redirected CDM file");
    if (readJson(root / name / "manifest.json").get("version").text != name) throw std::runtime_error("CDM version mismatch");
    return file;
  }
  return {};
}
int main(int argc, char** argv) {
  try {
    const fs::path appDir = fs::canonical("/proc/self/exe").parent_path();
    const fs::path core = appDir / "blanc-ecs-full-candidate";
    const fs::path shim = appDir / "blanc-cdm-preload.so";
    if (shim.string().find_first_of(": \t\n\r") != std::string::npos || fs::canonical(shim) != shim) throw std::runtime_error("unsafe preload helper path");
    fs::path profile = env("BLANC_ECS_FULL_PROFILE");
    if (profile.empty()) {
      fs::path config = env("XDG_CONFIG_HOME");
      if (config.empty()) config = fs::path(env("HOME")) / ".config";
      if (!config.is_absolute()) throw std::runtime_error("absolute config directory required");
      profile = config / "Blanc-ECS-Candidate";
      if (!fs::exists(profile)) {
        fs::create_directories(profile); chmod(profile.c_str(), 0700);
        int fd = open((profile / "ecs-candidate-profile.json").c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
        if (fd < 0) throw std::runtime_error("cannot initialize candidate profile");
        const char marker[] = "{\"candidate\":true}";
        const auto written = write(fd, marker, sizeof(marker) - 1); close(fd);
        if (written != static_cast<ssize_t>(sizeof(marker) - 1)) throw std::runtime_error("cannot mark candidate profile");
      }
    }
    struct stat info{};
    if (!profile.is_absolute() || fs::canonical(profile) != profile || stat(profile.c_str(), &info) || info.st_uid != getuid() || (info.st_mode & 0022)
      || !readJson(profile / "ecs-candidate-profile.json").get("candidate").boolean) throw std::runtime_error("marked owned candidate profile required");
    std::vector<std::string> args{core.string(), "--user-data-dir=" + profile.string()};
    for (int i = 1; i < argc; ++i) {
      const std::string arg = argv[i];
      if (arg == "--user-data-dir") { if (++i >= argc || argv[i] != profile.string()) throw std::runtime_error("conflicting profile argument"); continue; }
      if (arg.rfind("--user-data-dir=", 0) == 0) { if (arg.substr(16) != profile) throw std::runtime_error("conflicting profile argument"); continue; }
      if (arg == "--no-sandbox" || arg == "--no-zygote-sandbox" || arg == "--disable-setuid-sandbox" || arg == "--disable-seccomp-filter-sandbox") throw std::runtime_error("sandbox weakening refused");
      args.push_back(arg);
    }
    std::string cdm;
    try { cdm = component(profile).string(); }
    catch (const std::exception&) { std::cerr << "Candidate CDM metadata invalid; protected playback disabled for this launch\n"; }
    set("BLANC_ECS_FULL_PROFILE", profile.string());
    set("BLANC_ECS_CDM_PRELOAD_PATH", cdm);
    set("LD_PRELOAD", shim.string());
    set("BLANC_ECS_LAUNCHER_ROOT", appDir.string());
    unsetenv("APPIMAGE_EXIT_AFTER_INSTALL");
    std::vector<char*> raw; for (auto& arg : args) raw.push_back(arg.data()); raw.push_back(nullptr);
    execv(core.c_str(), raw.data());
    throw std::runtime_error(std::string("candidate exec failed: ") + strerror(errno));
  } catch (const std::exception& error) { std::cerr << "ECS candidate startup refused: " << error.what() << '\n'; return 126; }
}
