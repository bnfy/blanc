Feature: local crash diagnostics
  Blanc can retain bounded failure metadata for support without turning crash
  reporting into telemetry or attaching browsing data to the report.

  @F38-1
  Scenario: inspect and clear the local crash ledger from Settings
    Given Blanc has recorded a local tab crash
    When I open the Diagnostics settings
    Then Settings describes and counts the URL-free local crash ledger
    When I clear the local crash ledger
    Then Settings reports that no crashes are recorded
