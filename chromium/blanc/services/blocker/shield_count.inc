// Included inside blanc's anonymous namespace. Match shipping tab totals:
// retain across navigation/reload, reset on discard or renderer loss. Memory-only.
class ShieldTabCount final
    : public content::WebContentsUserData<ShieldTabCount>,
      public content::WebContentsObserver {
 public:
  ~ShieldTabCount() override = default;
  void PrimaryMainFrameRenderProcessGone(base::TerminationStatus) override;
  // Each committed page starts from zero, as shipping resets on main-frame
  // navigation (tab-view.js); a same-document change keeps its count.
  void PrimaryPageChanged(content::Page&) override;
  void AboutToBeDiscarded(content::WebContents*) override;
  void WasDiscarded() override;
  int value = 0;
 private:
  explicit ShieldTabCount(content::WebContents* contents);
  friend content::WebContentsUserData<ShieldTabCount>;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};
ShieldTabCount::ShieldTabCount(content::WebContents* contents)
    : WebContentsUserData(*contents), WebContentsObserver(contents) {}
void ShieldTabCount::PrimaryMainFrameRenderProcessGone(base::TerminationStatus) {
  value = 0;
}
void ShieldTabCount::PrimaryPageChanged(content::Page&) { value = 0; }
void ShieldTabCount::AboutToBeDiscarded(content::WebContents*) { value = 0; }
void ShieldTabCount::WasDiscarded() { value = 0; }
WEB_CONTENTS_USER_DATA_KEY_IMPL(ShieldTabCount);

// The Start Page's "blocked this week" (shipping's adblock-stats.js): a
// Monday-00:00-local week with Monday-indexed day buckets, in an unsynced
// profile preference. Shipping counts every blocked request, private tabs'
// too, so the private window's blocks go to its original profile.
constexpr char kWeekStatsPref[] = "blanc.blocking.week_stats";
base::Time CurrentWeekStart(base::Time now) {
  base::Time::Exploded e;
  now.LocalExplode(&e);
  const int back = (e.day_of_week + 6) % 7;
  e.hour = e.minute = e.second = e.millisecond = 0;
  base::Time midnight;
  if (!base::Time::FromLocalExploded(e, &midnight)) return now;
  // Step back whole days through local midnight, so a DST change mid-week
  // still lands on Monday 00:00.
  for (int i = 0; i < back; ++i) {
    (midnight - base::Hours(12)).LocalExplode(&e);
    e.hour = e.minute = e.second = e.millisecond = 0;
    if (!base::Time::FromLocalExploded(e, &midnight)) return now;
  }
  return midnight;
}
int DayIndex(base::Time now) {
  base::Time::Exploded e;
  now.LocalExplode(&e);
  return (e.day_of_week + 6) % 7;
}
// The stored week, or an empty one once the week has turned (rollWeekStats).
base::DictValue CurrentWeekStats(const PrefService* prefs, base::Time now) {
  const double week = CurrentWeekStart(now).InMillisecondsFSinceUnixEpoch();
  const base::DictValue& stored = prefs->GetDict(kWeekStatsPref);
  base::ListValue days;
  int blocked = 0;
  const auto* stored_days = stored.FindList("days");
  if (stored.FindDouble("weekStart") == week && stored_days && stored_days->size() == 7) {
    blocked = std::max(0, stored.FindInt("blocked").value_or(0));
    for (const auto& day : *stored_days) days.Append(day.is_int() && day.GetInt() >= 0 ? day.GetInt() : 0);
  } else {
    for (int i = 0; i < 7; ++i) days.Append(0);
  }
  return base::DictValue().Set("weekStart", week).Set("blocked", blocked).Set("days", std::move(days));
}
void RecordWeekBlock(content::WebContents* contents) {
  auto* profile = Profile::FromBrowserContext(contents->GetBrowserContext());
  if (!profile) return;
  PrefService* prefs = profile->GetOriginalProfile()->GetPrefs();
  const base::Time now = base::Time::Now();
  base::DictValue week = CurrentWeekStats(prefs, now);
  const int blocked = week.FindInt("blocked").value_or(0);
  if (blocked < std::numeric_limits<int>::max()) week.Set("blocked", blocked + 1);
  auto& day = (*week.FindList("days"))[DayIndex(now)];
  if (day.GetInt() < std::numeric_limits<int>::max()) day = base::Value(day.GetInt() + 1);
  prefs->SetDict(kWeekStatsPref, std::move(week));
}

// Capture both documents before asynchronous policy evaluation. A surviving
// child frame must not charge a newly committed top-level document.
class ShieldCountTicket {
 public:
  explicit ShieldCountTicket(content::RenderFrameHost* frame) {
    if (!frame) return;
    source_ = frame->GetWeakDocumentPtr();
    top_ = frame->GetMainFrame()->GetWeakDocumentPtr();
  }
  void RecordRuleBlock(int result) {
    if (recorded_ || result != 1) return;
    auto* source = source_.AsRenderFrameHostIfValid();
    auto* top = top_.AsRenderFrameHostIfValid();
    if (!source || !top || !source->IsRenderFrameLive() ||
        !top->IsRenderFrameLive() || source->GetMainFrame() != top) return;
    auto* contents = content::WebContents::FromRenderFrameHost(top);
    if (!contents || contents->GetPrimaryMainFrame() != top) return;
    auto* count = ShieldTabCount::GetOrCreateForWebContents(contents);
    if (count->value < std::numeric_limits<int>::max()) ++count->value;
    RecordWeekBlock(contents);
    recorded_ = true;
  }
 private:
  content::WeakDocumentPtr source_;
  content::WeakDocumentPtr top_;
  bool recorded_ = false;
};
