Feature: 1Password credential picker (dev spike)
  The picker's replies must be accepted by the real controller, its rows must
  render vault strings inertly, its mode must be modal, and a full list must stay
  reachable in a short window.

  @spike-1p-picker
  Scenario: a row click resolves as a selection
    When the credential picker is requested with two rows
    And the second row is clicked
    Then the pick resolves as selected index 1

  @spike-1p-picker
  Scenario: vault strings render as literal text
    When the credential picker is requested with hostile vault strings
    Then the picker row shows them as literal text
    And the hostile vault name renders as literal text
    And the picker row contains no injected elements

  @spike-1p-picker
  Scenario: picker mode isolates the panel's own controls
    When the credential picker is requested with hostile vault strings
    Then the address bar, footer, and Settings are hidden and unfocusable
    And the Cancel button is available

  @spike-1p-picker
  Scenario: Enter on the Cancel button dismisses rather than selecting
    When the credential picker is requested with two rows
    And Enter is pressed while the Cancel button has focus
    Then the pick resolves as dismissed

  @spike-1p-picker
  Scenario: the modal guard swallows clicks on hidden panel controls
    When the credential picker is requested with hostile vault strings
    And a hidden panel control is clicked while the picker is up
    Then the click never reaches the control

  @spike-1p-picker
  Scenario: a full picker stays reachable in a short window
    Given the window is 640 by 480
    When the credential picker is requested with ten rows
    Then the last row and Cancel are reachable
