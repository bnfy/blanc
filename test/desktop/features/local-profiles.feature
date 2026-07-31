Feature: local browser profiles
  A named local profile must have a separate persistent Chromium session and
  its own in-memory private session.

  @F33-1
  Scenario: a new profile receives isolated normal and private sessions
    When I open a named local profile window
    Then the named profile uses isolated normal and private browser sessions
