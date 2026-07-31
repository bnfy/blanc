Feature: Glance split view
  Glance shows a second tab from the same browser window alongside the active
  tab, and promotes either pane without crossing window/profile ownership.

  @F35-1
  Scenario: a Glance pane shares a window and can be promoted
    Given tabs open on "glance-one.example" and "glance-two.example"
    When I open Glance
    Then the browser shows an active tab and Glance side by side
    When I activate the Glance tab
    Then the Glance and active tabs swap roles
    When I close Glance
    Then the active tab fills the browser page
