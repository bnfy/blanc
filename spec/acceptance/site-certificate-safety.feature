Feature: Certificate safety

  @desktop @F39-1
  Scenario: A public site's invalid certificate offers no way through
    Given I navigate to a site with an untrusted certificate
    Then Blanc shows a certificate safety interstitial
    And the site information reports a certificate problem
    And no certificate bypass is offered

  @desktop @F39-2
  Scenario: A local address can be continued past for the session
    Given I navigate to a local address with an untrusted certificate
    Then Blanc shows a certificate safety interstitial
    When I open Advanced and continue to the local address
    Then the local page loads with its same-origin script
    And the site information reports that I continued past a warning

  @desktop @F39-3
  Scenario: A different certificate on the same local address warns again
    Given I continued past the warning on the local address
    When the local address starts presenting a different certificate
    And I reload the local tab
    Then Blanc shows a certificate safety interstitial for the local tab

  @desktop @F39-4
  Scenario: Stop allowing in one tab leaves another open page marked not secure
    Given two tabs continued past the warning on the local address
    When I stop allowing the local address from the first tab
    Then the first tab shows the certificate safety interstitial
    And the second tab still reports that I continued past a warning
    When I reload the second tab
    Then the second tab shows the certificate safety interstitial

  @desktop @F39-5
  Scenario: Private tabs keep their own certificate choices
    Given I continued past the warning on the local address
    When I open the local address in a private tab
    Then the private tab shows the certificate safety interstitial

  @desktop @F39-6
  Scenario: A reopened page keeps its not-secure state, and eviction does not clear it
    Given I continued past the warning on the local address
    When I close the local tab and reopen it straight away
    Then the reopened tab shows the same page without loading it again
    And the reopened tab still reports that I continued past a warning
    When the local address's choice is evicted
    Then the reopened tab still reports that I continued past a warning

  @desktop @F39-7
  Scenario: Going back to a page loaded past a warning still reports it after a trusted load on the same host
    Given I continued past the warning on the lab address
    When the lab address starts presenting a trusted certificate
    And I stop allowing the lab address without reloading
    And I navigate the lab tab to another page on the same address
    Then the lab tab reports a secure connection
    When I go back in the lab tab
    Then the lab tab still reports that I continued past a warning
    When I go forward in the lab tab
    Then the lab tab reports a secure connection
