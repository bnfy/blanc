-- The owner authorized this one native permission on disposable Intel CI.
-- Never interact with browser content or with other permission categories.
tell application "System Events"
  set candidates to {}
  set unmatchedPrompt to ""
  repeat with ownerId in {"com.apple.UserNotificationCenter", "com.apple.CoreServicesUIAgent", "com.apple.SecurityAgent"}
    repeat with ownerProcess in (application processes whose bundle identifier is (contents of ownerId))
      repeat with nativeWindow in windows of ownerProcess
        try
          set elements to entire contents of nativeWindow
          set promptText to ""
          set allowButtons to {}
          set denyCount to 0
          repeat with elementItem in elements
            if class of elementItem is static text then
              set promptText to promptText & " " & (value of elementItem as text)
            else if class of elementItem is button then
              set buttonName to name of elementItem as text
              if buttonName is "Allow" then set end of allowButtons to elementItem
              if buttonName is "Don’t Allow" or buttonName is "Don't Allow" then set denyCount to denyCount + 1
            end if
          end repeat
          ignoring case
            set isAudioPrompt to promptText contains "Blanc" and promptText contains "microphone" and promptText does not contain "camera" and promptText does not contain "screen recording"
          end ignoring
          if isAudioPrompt and (count of allowButtons) is 1 and denyCount is 1 then
            set end of candidates to {contents of ownerId, item 1 of allowButtons}
          else if isAudioPrompt then
            set unmatchedPrompt to "unmatched|" & (contents of ownerId) & "|allow=" & (count of allowButtons) & "|deny=" & denyCount
          end if
        end try
      end repeat
    end repeat
  end repeat
  if (count of candidates) is 0 then
    if unmatchedPrompt is not "" then return unmatchedPrompt
    return "waiting"
  end if
  if (count of candidates) is not 1 then return "ambiguous"
  set selectedPrompt to item 1 of candidates
  click item 2 of selectedPrompt
  return "approved|" & item 1 of selectedPrompt
end tell
