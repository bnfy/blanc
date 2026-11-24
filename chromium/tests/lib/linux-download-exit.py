"""Locate the native pending-download dialog's Exit button on X11, or press it.

`linux-download-exit.py PID` prints the button's screen centre(s);
`linux-download-exit.py PID --press` activates it through AT-SPI, the way a
screen reader would. The accessible extents don't match where the dialog is
drawn under Xvfb and Openbox (a real click there missed the button), so the
quit check confirms Exit this way; the window's Close stays a real click.
"""
import json
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def children(accessible):
    for index in range(accessible.get_child_count()):
        child = accessible.get_child_at_index(index)
        if child is not None:
            yield child


def find_exit(node, in_dialog=False):
    role = node.get_role()
    if role == Atspi.Role.DOCUMENT_WEB:
        return  # Only Chromium's own UI can confirm the close.
    if node.get_name() == "Download is in progress":
        in_dialog = role in (Atspi.Role.DIALOG, Atspi.Role.ALERT, Atspi.Role.FRAME)
    if in_dialog and role == Atspi.Role.PUSH_BUTTON and node.get_name() == "Exit":
        state = node.get_state_set()
        if state.contains(Atspi.StateType.SHOWING) and state.contains(Atspi.StateType.VISIBLE):
            rect = node.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
            if rect.width > 0 and rect.height > 0:
                yield {"x": rect.x + rect.width // 2, "y": rect.y + rect.height // 2, "node": node}
    for child in children(node):
        yield from find_exit(child, in_dialog)


if __name__ == "__main__":
    pid = int(sys.argv[1])
    found = [point for app in children(Atspi.get_desktop(0))
             if app.get_process_id() == pid for point in find_exit(app)]
    if "--press" in sys.argv[2:]:
        assert found, "no Exit button to press"
        action = found[0]["node"].get_action_iface()
        names = [action.get_action_name(i) for i in range(action.get_n_actions())]
        index = next((i for i, n in enumerate(names) if n in ("press", "click", "activate")), 0)
        print(json.dumps({"pressed": action.do_action(index), "action": names[index] if names else None}))
    else:
        print(json.dumps([{k: v for k, v in p.items() if k != "node"} for p in found]))
