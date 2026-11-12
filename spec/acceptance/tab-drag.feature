Feature: Drag to reorder tabs and groups
  The vertical rail and the expanded island share one drag gesture and one
  keyboard path. Every behaviour is checked on both surfaces.

  Background:
    Given groups "work" and "play" each hold three loaded tabs
    And two loose tabs are open

  @F3-6 @F3 @desktop
  Scenario Outline: Reorder within a group
    When I drag the third "work" tab before the first "work" tab in the <surface>
    Then "work" lists that tab first

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-7 @F3 @desktop
  Scenario Outline: Move a tab from one group to another
    When I drag the first "play" tab before the second "work" tab in the <surface>
    Then that tab belongs to "work" at that position

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-8 @F3 @desktop
  Scenario Outline: Move a grouped tab to the loose section
    When I drag the first "work" tab before the first loose tab in the <surface>
    Then that tab is loose and leads the loose section

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-9 @F3 @desktop
  Scenario Outline: Move a loose tab into a group
    When I drag the first loose tab before the first "play" tab in the <surface>
    Then that tab belongs to "play" at that position

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-10 @F3 @desktop
  Scenario Outline: Drop on a collapsed group header
    Given "play" is collapsed
    When I drag the first loose tab onto the "play" header in the <surface>
    Then that tab is the last tab of "play"
    And "play" is still collapsed

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-11 @F3 @desktop
  Scenario Outline: Reorder groups
    When I drag the "play" header above the "work" header in the <surface>
    Then the group order is "play", "work"
    And the cluster shortcut for "play" comes before the one for "work" and selects its first tab

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-12 @F3 @desktop
  Scenario Outline: The source group dissolves when its last tab leaves
    Given group "solo" holds one loaded tab
    When I drag the first "solo" tab before the first loose tab in the <surface>
    Then the group "solo" no longer exists

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-13 @F3 @desktop
  Scenario Outline: Pin-crossing drops are rejected
    Given the first loose tab is pinned
    When I drag that pinned tab before the second loose tab in the <surface>
    Then canonical tab order, groups and pinned state are unchanged

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-14 @F3 @desktop
  Scenario Outline: Keyboard moves skip collapsed groups
    Given group "mid" holds one loaded tab and sits between "work" and "play"
    And "mid" is collapsed
    When I focus the last "work" tab in the <surface> and press Alt+Shift+ArrowDown
    Then that tab is ungrouped between "work" and "mid"
    When I press Alt+Shift+ArrowDown on that tab in the <surface>
    Then that tab is ungrouped between "mid" and "play"
    When I press Alt+Shift+ArrowDown on that tab in the <surface>
    Then that tab belongs to "play" as its first tab

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-15 @F3 @desktop
  Scenario Outline: Dragging out over page content has no page effect
    Given the active tab is the drag probe page
    When I drag the first "work" tab out over the page and release it in the <surface>
    Then the probe page did not navigate
    And the probe page saw no drag, drop or paste events and no tab id
    And canonical tab order and groups are unchanged

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-17 @F3 @desktop
  Scenario: Move Recently closed among the groups in the island
    Given a loose tab has been closed
    When I drag Recently closed above the "play" header in the island
    Then in the island Recently closed sits before "play"
    When I focus Recently closed in the island and press Alt+Shift+ArrowUp
    Then in the island Recently closed sits before "work"
    When I drag Recently closed above the "play" header in the island
    And I relaunch Blanc
    And a loose tab has been closed
    Then in the island Recently closed sits before "play"

  @F3-16 @F3 @desktop
  Scenario: Escape mid-drag keeps the island open
    When I start dragging the first "work" tab in the island
    And I press Escape during the drag
    Then the island panel is still open
    And the island drag flag is clear
    And canonical tab order and groups are unchanged

  @F3-22 @F3 @desktop
  Scenario Outline: Place an ungrouped tab between two groups
    When I drag the first loose tab above the "play" header in the <surface>
    Then that tab is ungrouped between "work" and "play"

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-23 @F3 @desktop
  Scenario Outline: Drag a group's first tab out just above its group
    When I drag the first "work" tab above the "work" header in the <surface>
    Then that tab is ungrouped directly above "work"

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-24 @F3 @desktop
  Scenario: A new group appears where its tab was
    When I drag the first loose tab above the "work" header in the island
    And I put that tab in a new group "Research"
    Then the group order is "Research", "work"

  @F3-25 @F3 @desktop
  Scenario: A run between groups is its own section
    When I drag the first loose tab above the "play" header in the island
    Then the cluster shortcut for that tab's run selects that tab
    And the Island's dots show only that tab

  @F3-26 @F3 @desktop
  Scenario: Recently closed between two ungrouped tabs survives a relaunch
    Given a third loose tab is open
    And a loose tab has been closed
    When I drag Recently closed above the "loose-3" tab in the island
    Then in the island Recently closed sits directly above the "loose-3" tab
    When I relaunch Blanc
    And a loose tab has been closed
    Then in the island Recently closed sits directly above the "loose-3" tab
