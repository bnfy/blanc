// Spaces across profiles (F41-83 to F41-92; plan
// docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md). Every
// loaded regular profile mirrors the part of its Space list that may cross
// profiles into Local State, keyed by its directory ("Default",
// "Profile 1", ...), so a window of another profile lists those Spaces without
// loading it. A profile's mirror is written when it loads and whenever its
// blanc.spaces.meta changes; it stays after the profile unloads (V31) and goes
// when the profile is removed. Registered in browser_prefs.cc (patch 0106).
constexpr char kSpacesMirrorPref[] = "blanc.spaces.profiles";

// The rows of one Spaces dictionary: a profile's blanc.spaces.meta ({order,
// items, deleted}) when writing, a mirrored entry ({order, items}) when
// reading. Both sides go through the same pure rule, so a damaged or edited
// Local State never passes anything but the allowlisted fields.
std::vector<blanc::spaces_across_profiles::Space> SpacesMirrorRows(const base::DictValue& meta) {
  namespace s = blanc::spaces_across_profiles;
  std::vector<std::string> order;
  std::map<std::string, s::Space> items;
  std::set<std::string> deleted;
  if (const auto* list = meta.FindList("order"))
    for (const auto& id : *list) if (id.is_string()) order.push_back(id.GetString());
  if (const auto* list = meta.FindList("deleted"))
    for (const auto& id : *list) if (id.is_string()) deleted.insert(id.GetString());
  if (const auto* dict = meta.FindDict("items")) {
    for (const auto [id, value] : *dict) {
      if (!value.is_dict()) continue;
      const auto& item = value.GetDict();
      s::Space space;
      if (const auto* text = item.FindString("name")) space.name = *text;
      if (const auto* text = item.FindString("color")) space.color = *text;
      if (const auto* text = item.FindString("symbol")) space.symbol = *text;
      const double tabs = item.FindDouble("tabCount").value_or(0);
      space.tab_count = std::isfinite(tabs) ? static_cast<int>(std::clamp(tabs, 0.0, 10000.0)) : 0;
      items.emplace(id, std::move(space));
    }
  }
  return s::MirrorRows(order, items, deleted);
}

base::DictValue SpacesMirrorValue(const std::vector<blanc::spaces_across_profiles::Space>& rows) {
  base::ListValue order;
  base::DictValue items;
  for (const auto& row : rows) {
    order.Append(row.id);
    items.Set(row.id, base::DictValue().Set("name", row.name).Set("color", row.color)
        .Set("symbol", row.symbol).Set("tabCount", row.tab_count));
  }
  return base::DictValue().Set("order", std::move(order)).Set("items", std::move(items));
}

// Another profile's Spaces, as its mirror holds them; none when it has no
// mirror yet (V31). The Spaces menu's other-profile list reads it (plan
// Task 4, which drops [[maybe_unused]]).
[[maybe_unused]] std::vector<blanc::spaces_across_profiles::Space> ReadSpacesMirror(const std::string& directory) {
  auto* local = g_browser_process->local_state();
  const auto* entry = local ? local->GetDict(kSpacesMirrorPref).FindDict(directory) : nullptr;
  return entry ? SpacesMirrorRows(*entry) : std::vector<blanc::spaces_across_profiles::Space>();
}

// Every Island host lists the Spaces again, but those of `except`'s profile:
// spaceMetaSave already pings that profile's other windows.
void NotifySpacesMenus(Profile* except) {
  for (auto* owner : Owner::Live()) {
    if (!owner->view || owner->browser->GetProfile()->GetOriginalProfile() == except) continue;
    auto* frame = owner->view->GetWebContents()->GetPrimaryMainFrame();
    if (frame->IsRenderFrameLive())
      frame->ExecuteJavaScript(u"window.BlancPrototypeHost?.spacesChanged()", base::NullCallback());
  }
}

class SpacesMirror final : public ProfileManagerObserver,
                           public ProfileObserver,
                           public ProfileAttributesStorage::Observer {
 public:
  static SpacesMirror* Get();
  // Once, from the first Island window: profiles loaded before then are
  // mirrored here, later ones as ProfileManager adds them.
  void Start();

  // ProfileManagerObserver: a profile loaded in this run (every run, unlike
  // the storage's OnProfileAdded below). Its mirror follows its Space list
  // from now on, and is written once now: the backfill V31 relies on.
  void OnProfileAdded(Profile* profile) override;
  // The profile is listed by others as live no longer.
  void OnProfileMarkedForPermanentDeletion(Profile*) override;
  void OnProfileManagerDestroying() override;

  // ProfileObserver: the profile unloads; its mirror stays (V31).
  void OnProfileWillBeDestroyed(Profile* profile) override;

  // ProfileAttributesStorage::Observer: a profile created on this device (once,
  // when it is first made). It is listed, with no Spaces until it loads.
  void OnProfileAdded(const base::FilePath&) override;
  // The profile's mirror goes with it.
  void OnProfileWasRemoved(const base::FilePath& path, const std::u16string&) override;
  // Other profiles' menus head its Spaces with its name.
  void OnProfileNameChanged(const base::FilePath&, const std::u16string&) override;

 private:
  friend class base::NoDestructor<SpacesMirror>;
  SpacesMirror();
  ~SpacesMirror() override;

  void Write(Profile* profile);

  bool started_ = false;
  std::map<Profile*, std::unique_ptr<PrefChangeRegistrar>> registrars_;
  base::ScopedObservation<ProfileManager, ProfileManagerObserver> manager_{this};
  base::ScopedObservation<ProfileAttributesStorage, ProfileAttributesStorage::Observer> storage_{this};
  base::ScopedMultiSourceObservation<Profile, ProfileObserver> profiles_{this};
};

SpacesMirror::SpacesMirror() = default;
SpacesMirror::~SpacesMirror() = default;

SpacesMirror* SpacesMirror::Get() {
  static base::NoDestructor<SpacesMirror> mirror;
  return mirror.get();
}

void SpacesMirror::Start() {
  auto* manager = g_browser_process->profile_manager();
  if (started_ || !manager) return;
  started_ = true;
  manager_.Observe(manager);
  storage_.Observe(&manager->GetProfileAttributesStorage());
  for (auto* profile : manager->GetLoadedProfiles()) OnProfileAdded(profile);
}

void SpacesMirror::OnProfileAdded(Profile* profile) {
  if (!profile->IsRegularProfile() || registrars_.contains(profile)) return;
  auto registrar = std::make_unique<PrefChangeRegistrar>();
  registrar->Init(profile->GetPrefs());
  registrar->Add(kSpacesMetaPref, base::BindRepeating(&SpacesMirror::Write,
      base::Unretained(this), base::Unretained(profile)));
  registrars_.emplace(profile, std::move(registrar));
  profiles_.AddObservation(profile);
  Write(profile);
}

void SpacesMirror::OnProfileMarkedForPermanentDeletion(Profile*) { NotifySpacesMenus(nullptr); }

void SpacesMirror::OnProfileManagerDestroying() {
  registrars_.clear();
  profiles_.RemoveAllObservations();
  storage_.Reset();
  manager_.Reset();
}

void SpacesMirror::OnProfileWillBeDestroyed(Profile* profile) {
  registrars_.erase(profile);
  if (profiles_.IsObservingSource(profile)) profiles_.RemoveObservation(profile);
}

void SpacesMirror::OnProfileAdded(const base::FilePath&) { NotifySpacesMenus(nullptr); }

void SpacesMirror::OnProfileWasRemoved(const base::FilePath& path, const std::u16string&) {
  if (auto* local = g_browser_process->local_state()) {
    auto mirror = local->GetDict(kSpacesMirrorPref).Clone();
    if (mirror.Remove(path.BaseName().AsUTF8Unsafe())) local->SetDict(kSpacesMirrorPref, std::move(mirror));
  }
  NotifySpacesMenus(nullptr);
}

void SpacesMirror::OnProfileNameChanged(const base::FilePath&, const std::u16string&) { NotifySpacesMenus(nullptr); }

void SpacesMirror::Write(Profile* profile) {
  auto* local = g_browser_process->local_state();
  auto* manager = g_browser_process->profile_manager();
  // A removed profile stays loaded until Blanc quits; it is never mirrored
  // again once OnProfileWasRemoved has erased it.
  if (!local || !manager ||
      !manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(profile->GetPath())) return;
  const auto directory = profile->GetPath().BaseName().AsUTF8Unsafe();
  auto value = SpacesMirrorValue(SpacesMirrorRows(profile->GetPrefs()->GetDict(kSpacesMetaPref)));
  const auto* current = local->GetDict(kSpacesMirrorPref).FindDict(directory);
  if (current && *current == value) return;
  auto mirror = local->GetDict(kSpacesMirrorPref).Clone();
  mirror.Set(directory, std::move(value));
  local->SetDict(kSpacesMirrorPref, std::move(mirror));
  NotifySpacesMenus(profile);
}

void StartSpacesMirror() { SpacesMirror::Get()->Start(); }
