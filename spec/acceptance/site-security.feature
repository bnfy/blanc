@site-security @F31
Feature: HTTPS and site information
  Connection claims come from trusted browser state, and a failed certificate
  can never be bypassed from Blanc's interstitial.

  @F31-1 @all @release
  Scenario: Plain HTTP is visibly identified
    Given the active page uses plain HTTP
    Then the resting Island warns that the connection is not secure
    When I open site information
    Then the site-information card explains the unencrypted connection

  @F31-2 @all @release
  Scenario: HTTPS site information is available from the command bar
    Given the active page uses verified HTTPS
    When I open site information
    Then the site-information card identifies an encrypted authenticated connection
    And it reports Blanc protection activity for that page

  @F31-3 @all @release
  Scenario: A certificate failure has no bypass
    Given the active navigation fails certificate verification
    Then Blanc shows a certificate-specific safety interstitial
    And the interstitial exposes no proceed or visit-anyway action
