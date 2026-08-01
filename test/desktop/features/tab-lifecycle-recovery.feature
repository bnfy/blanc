Feature: tab lifecycle recovery
  Reopen Closed Tab is a local window recovery action. It must never carry a
  tab across a profile boundary, and it should restore the tab presentation a
  person intentionally closed.

  @F34-1 @release
  Scenario: closed-tab recovery stays in its profile and restores tab state
    When I close a Personal tab and open a named local profile window
    Then closed-tab recovery stays in that profile and restores its tab state
