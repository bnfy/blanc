@island
Feature: Island chrome, command palette, and slash commands
  The single custom command surface: the resting pill, the expanded command
  palette with the Quick Switcher, and slash commands. Steps are intent-level;
  each platform binds them to its native trigger (D7) and windowing (D11).

  Background:
    Given ad/tracker blocking is enabled

  @F1-1 @F1 @all
  Scenario: The resting pill reflects the active tab and its blocking state
    Given a group named "work" with 3 tabs
    And the active tab is in "work" on a page where 2 requests were blocked
    When the island is at rest
    Then the island shows back and forward controls
    And the island shows 3 direct tab dots
    And the island shows the active page's domain
    And the island shows a shield count of 2
    And the island shows the trailing action cluster

  @F1-2 @F1 @all
  Scenario: Opening the palette floats the command bar with the tab switcher
    Given 2 tabs are open
    When I open the command palette
    Then the command bar is shown over the page content
    And the list area shows the tab switcher

  @F6-1 @F6 @all
  Scenario: The Quick Switcher matches open tabs and favorites
    Given a tab open on "news.example"
    And a favorite for "docs.example"
    When I open the command palette
    And I type "exa"
    Then the results include the tab "news.example"
    And the results include the favorite "docs.example"

  @F6-2 @F6 @all
  Scenario: The Quick Switcher matches a group name and focuses it
    Given a group named "research" with 2 tabs that is not active
    When I open the command palette
    And I type "research"
    Then a group result "research" is listed above any tab results
    When I choose the group result "research"
    Then the active tab is one of the tabs in "research"

  @F7-1 @F7 @all
  Scenario: A slash prefix filters the command list
    When I open the command palette
    And I type "/gr"
    Then the command "/group" is listed
    And the command "/history" is not listed

  @F7-2 @F7 @all
  Scenario Outline: Running a slash command performs its action
    When I open the command palette
    And I run the slash command "<command>"
    Then <outcome>

    Examples:
      | command    | outcome                                          |
      | /new       | a new ungrouped tab opens on the new-tab page     |
      | /downloads | the downloads page opens in the utility sheet     |
      | /find      | the find bar is shown                             |

  @F7-3 @F7 @desktop
  Scenario Outline: A shortened slash command reads its argument after the typed word
    Given a tab open on "slash-arguments"
    And the appearance is set to "light"
    When I run the slash command "<typed>"
    Then <outcome>

    Examples:
      | typed        | outcome                                                    |
      | /gr work     | a group named "work" exists                                |
      | /sav Reading | the page on "slash-arguments" is a Favorite in "Reading"   |
      | /the dark    | the appearance is "dark"                                   |
      | /spa Weekend | a space named "Weekend" is saved and this window is in it |

  @F7-4 @F7 @desktop
  Scenario: A group command with no name asks for one
    Given a tab open on "slash-arguments"
    When I run the slash command "/gr"
    Then the command bar reads "/group " with "" selected
    And no group exists

  @F47-1 @F47 @desktop
  Scenario: A typed bang shows a hint row and Enter lands on the site
    Given a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"

  @F47-2 @F47 @desktop
  Scenario: A bare known code opens the site's home
    Given a tab open on "bangs-start"
    When I type "!yt" in the command bar
    Then the bang hint row reads "Open YouTube"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/"

  @F47-3 @F47 @desktop
  Scenario: A bang at the end of the text works the same
    Given a tab open on "bangs-start"
    When I type "lofi !yt" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"

  @F47-4 @F47 @desktop
  Scenario: ! alone lists popular bangs, then the ones used recently
    Given a tab open on "bangs-start"
    When I type "!" in the command bar
    Then the picker shows the section "popular"
    And the picker lists "!wikipedia"
    When I type "!yt lofi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"
    When I type "!" in the command bar
    Then the picker shows the section "recent"
    And the picker lists "!yt" first
    When I press Arrow Down in the command bar
    Then the first picker row is highlighted

  @F47-5 @F47 @desktop
  Scenario: A known prefix shows its hint above the filtered picker, and a picked row fills the input
    Given a tab open on "bangs-start"
    When I type "!y" in the command bar
    Then the bang hint row reads "Open Yahoo!"
    And the picker lists "!yt"
    When I choose the picker row "!yt"
    Then the command bar text is "!yt "

  @F47-6 @F47 @desktop
  Scenario: A custom bang resolves, and one that shadows a built-in alias wins only for that alias
    Given a custom bang "m" named "Mine" for "https://m.example/?q=%s"
    And a custom bang "ytb" named "Shadow" for "https://shadow.example/?q=%s"
    And a tab open on "bangs-start"
    When I type "!m hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://m.example/?q=hi"
    When I type "!ytb hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://shadow.example/?q=hi"
    When I type "!yt hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=hi"

  @F47-7 @F47 @desktop
  Scenario: Turning bangs off takes effect in the open command bar
    Given the search engine is "duckduckgo"
    And a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I turn bangs off while the command bar is open
    Then no bang hint row is shown
    When I submit the command-bar text
    Then the search submission uses "duckduckgo" for "!yt lofi"

  @F47-8 @F47 @desktop
  Scenario: Recently used bangs skip private tabs and go with the history
    Given the active tab is private
    When I type "!yt lofi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"
    And the recently used bangs are ""
    Given a tab open on "bangs-start"
    When I type "!gh blanc" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://github.com/search?q=blanc"
    And the recently used bangs are "gh"
    When I run the slash command "/clear"
    Then the recently used bangs are ""

  @F47-9 @F47 @desktop
  Scenario: No suggestion request leaves while a bang is typed
    Given the autocomplete provider returns "lofi girl"
    And a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the autocomplete provider has not received a request

  @F47-10 @F47 @desktop
  Scenario: Main refuses a direct suggestions request for bang-shaped text
    Given the autocomplete provider returns "lofi girl"
    And a tab open on "bangs-start"
    When I type "plain" in the command bar
    Then a direct suggestions request for "!yt lofi" is refused
    And a direct suggestions request for "!zzz lofi" is refused

  @F47-11 @F47 @desktop
  Scenario: Your bangs are managed through Settings
    Given a tab open on "bangs-start"
    And the Settings sheet is open
    When I add the bang "m" named "Mine" for "https://m.example/?q=%s" in Settings
    Then Settings lists the bang "m"
    When I add the bang "a" named "Shop" for "https://shop.example/?q=%s" in Settings
    Then Settings says "Replaces the built-in !a (Amazon.com)"
    When I add the bang "m" named "Again" for "https://again.example/?q=%s" in Settings
    Then Settings says "You already have !m."
    When I add the bang "bad code" named "x" for "https://x.example/?q=%s" in Settings
    Then Settings says "That bang isn't valid — check the code and the address."
    When I remove the bang "m" in Settings
    And I remove the bang "a" in Settings
    Then Settings lists no bangs
    When I type "!m hi" in the command bar
    Then no bang hint row is shown

  @F47-12 @F47 @desktop
  Scenario: Arrow Down from the hint reaches the local matches under it
    Given a loaded tab titled "lofi hip hop"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I press Arrow Down in the command bar
    Then the row for the tab titled "lofi hip hop" is highlighted under the hint

  @F47-13 @F47 @desktop
  Scenario: A bare unknown code searches as typed, and ! alone does nothing
    Given the search engine is "duckduckgo"
    And a tab open on "bangs-start"
    When I type "!zzzq" in the command bar
    Then no bang hint row is shown
    When I submit the command-bar text
    Then the address submission goes to "https://duckduckgo.com/?q=!zzzq"
