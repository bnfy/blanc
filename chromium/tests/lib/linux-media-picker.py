"""Describe Chromium's screen-share picker on X11 through AT-SPI, read only.

`linux-media-picker.py PID` prints JSON: whether the picker is open, which of
its views has keyboard focus, whether its Share button is enabled, its pane
tabs and its list entries. The screen-share check sends real keys and reads
this between them. It never presses, clicks or focuses anything: under Xvfb
and Openbox a Views dialog's accessible extents and actions were not reliable
(the quit check, run 45056244980), while its names and states are only read.
"""
import json
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

S = Atspi.StateType
CONTAINERS = {Atspi.Role.DIALOG, Atspi.Role.ALERT, Atspi.Role.FRAME, Atspi.Role.WINDOW}
ITEMS = {"list item", "table row", "table cell", "tree item", "push button", "toggle button", "check box"}
LIMIT = 4000  # Nodes visited per read; the browser's own views are well below it.


def children(node):
    for index in range(node.get_child_count()):
        child = node.get_child_at_index(index)
        if child is not None:
            yield child


def describe(node):
    states = node.get_state_set()
    return {
        "role": node.get_role_name(),
        "name": node.get_name() or "",
        "enabled": states.contains(S.ENABLED) or states.contains(S.SENSITIVE),
        "focused": states.contains(S.FOCUSED),
        "selected": states.contains(S.SELECTED),
        "showing": states.contains(S.SHOWING),
    }


def find_picker(node, ancestors, budget):
    """The nearest window-like ancestor of a showing push button named Share."""
    budget[0] -= 1
    if budget[0] < 0 or node.get_role() == Atspi.Role.DOCUMENT_WEB:
        return None  # Web pages, the Island's included, are never the picker.
    if node.get_role() == Atspi.Role.PUSH_BUTTON and node.get_name() == "Share" \
            and node.get_state_set().contains(S.SHOWING):
        return next((a for a in reversed(ancestors) if a.get_role() in CONTAINERS), node)
    ancestors.append(node)
    try:
        for child in children(node):
            found = find_picker(child, ancestors, budget)
            if found is not None:
                return found
    finally:
        ancestors.pop()
    return None


def summarize(dialog):
    result = {"found": True, "dialog": describe(dialog), "focus": None, "share": None,
              "buttons": [], "paneTabs": [], "items": []}
    stack, seen = [dialog], 0
    while stack and seen < LIMIT:
        node = stack.pop()
        seen += 1
        if node.get_role() == Atspi.Role.DOCUMENT_WEB:
            continue
        info = describe(node)
        if info["focused"] and result["focus"] is None:
            result["focus"] = info
        if info["role"] == "push button" and info["name"] in ("Share", "Cancel"):
            result["buttons"].append(info)
            if info["name"] == "Share":
                result["share"] = info
        elif info["role"] == "page tab":
            result["paneTabs"].append(info)
        elif info["role"] in ITEMS and len(result["items"]) < 40:
            result["items"].append(info)
        stack.extend(reversed(list(children(node))))
    return result


if __name__ == "__main__":
    pid = int(sys.argv[1])
    for app in children(Atspi.get_desktop(0)):
        if app.get_process_id() != pid:
            continue
        dialog = find_picker(app, [], [LIMIT])
        if dialog is not None:
            print(json.dumps(summarize(dialog)))
            break
    else:
        print(json.dumps({"found": False}))
