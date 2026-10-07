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
    And the first cluster shortcut selects the first "play" tab

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

  @F3-16 @F3 @desktop
  Scenario: Escape mid-drag keeps the island open
    When I start dragging the first "work" tab in the island
    And I press Escape during the drag
    Then the island panel is still open
    And the island drag flag is clear
    And canonical tab order and groups are unchanged
