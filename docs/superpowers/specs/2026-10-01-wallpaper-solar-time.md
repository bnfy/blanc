# City-based wallpaper timing (unreleased)

The owner expected the darkest wallpaper at sunset and reported dusk artwork
at 7:09 PM in New York on October 1. Public v1.25.0 follows the original
device-local-clock scope with fixed windows: dawn 05:00–08:00, day 08:00–17:00,
dusk 17:00–20:00, night 20:00–05:00. It does not calculate sunset.

On October 1 the owner chose “Follow local sunrise/sunset with a chosen city.”
This extends the original clock-only scope without introducing location access
or a network service. This document describes a candidate, not public capability.

Settings → General adds Wallpaper city with an offline searchable GeoNames
catalog. The selected canonical city id is device-local, validated on read and
write, and excluded from Profile Sync. The existing free on/off preference
continues to sync. Removing the city, or upgrading without selecting one,
retains the existing clock schedule. Travel does not silently change the
chosen city; the user can select their destination.

SunCalc 2.1.0 runs locally from its verbatim bundled browser/CommonJS build.
Night starts at calculated sunset, rather than astronomical night. Dawn runs
from civil dawn to the morning golden-hour end; day continues until evening
golden hour, then dusk lasts until sunset. Polar day/night stay day/night.
Minute refresh, focus/resume, reduced motion, fades, all layouts and private
tabs retain the existing controller behavior. Wallpaper phases retain the
existing theme treatment; the selected app theme is not changed.

The GeoNames cities15000/admin1/country snapshot is transformed into a compact
catalog with city labels, coordinates, population ordering and search aliases.
Source hashes, licenses, and adaptations are recorded alongside the catalog
and in the runtime SBOM/notices. Upstream city and solar bundle bytes use LF
on every platform to preserve hash verification.

Evidence: unit tests cover the reported NY instant, exact phase boundaries,
seasonal timing, polar cases, canonical city validation, bounded offline search,
source hashes, persistence and sync exclusion. Real Electron tests select a
city with the keyboard, verify the 7:09 PM night phase without reloading,
change/reset the city, check narrow writes and responsive results, and cover
all four layouts and private tabs. Existing wallpaper regression checks are
included with this city test in Linux CI and the press release gate.
