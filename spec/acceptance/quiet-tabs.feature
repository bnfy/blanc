@quiet-tabs
Feature: Quiet Tabs
  Blanc discards the renderer process of a tab you have not opened in a while
  and rebuilds it when you come back. The tab keeps its identity — title,
  address, favicon, and back history — the whole time.

  @F31-10 @F31 @desktop @D8
  Scenario: Quieting a tab releases a real renderer process, and waking brings one back
    Given a background tab on a quietable page
    And the renderer process count is recorded
    When I quiet that background tab
    Then that tab is quiet
    And the renderer process count has dropped by 1
    When I activate that quiet tab
    Then that tab is awake
    And the renderer process count has returned to what it was
