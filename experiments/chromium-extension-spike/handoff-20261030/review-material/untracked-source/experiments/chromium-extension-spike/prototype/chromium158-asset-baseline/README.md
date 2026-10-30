# Chromium 158 asset baseline

This is a durable copy of the 78-file development candidate based on shipping Blanc v1.45.0 (`6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`) and previously scoped Chromium 158 groups/wallpaper checks. `manifest.json` binds each file and the original candidate manifest. It is a preparation baseline, not a statement of complete product parity or authorization to ship.

`prepare.mjs <158-src> --assets-only` validates the baseline, overlays current prototype-owned files, writes to `generated-158`, and writes a separate receipt stating whether every byte matches the tested baseline. Changed overlays require affected checks and new qualification; do not promote solely because preparation succeeded. Native preparation for 158 and research hooks remain rejected, and the 157 preparation continues using its separate source/asset path. Future shipping releases require a deliberate rebase of this snapshot and comparison with the exact latest released source.
