// Called on a MayBlock thread. Never report the other Local State data.
std::optional<bool> ReadSunriseOnDisk(base::FilePath path) {
  std::string json;
  if (!base::ReadFileToStringWithMaxSize(path, &json, 16 * 1024 * 1024))
    return std::nullopt;
  auto data = base::JSONReader::Read(json, base::JSON_PARSE_RFC);
  if (!data || !data->is_dict()) return std::nullopt;
  auto value = data->GetDict().FindBoolByDottedPath(kLaunchSunrisePref);
  // An absent pref in a valid store resolves to the registered default false.
  if (!value && !data->GetDict().FindByDottedPath(kLaunchSunrisePref)) return false;
  return value;
}
