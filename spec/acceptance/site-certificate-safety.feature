@desktop @F39-1
Feature: Certificate safety
  Scenario: An invalid certificate is rejected without a bypass
    Given I navigate to a site with an untrusted certificate
    Then Blanc shows a certificate safety interstitial
    And the site information reports a certificate problem
    And no certificate bypass is offered
