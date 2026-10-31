#!/usr/bin/env python3
"""Prepare the matching command-state patch without modifying the checkout."""
import argparse
import difflib
import hashlib
from pathlib import Path

EXPECTED = '3250da65392f20df2da786e5aa9ac2d5636e5bc199e3ef09826bbcecf291fd12'
OLD = '''  command_updater_->UpdateCommandEnabled(IDC_ZOOM_PLUS, CanZoomIn(contents));
  command_updater_->UpdateCommandEnabled(IDC_ZOOM_NORMAL,
                                         CanResetZoom(contents));
  command_updater_->UpdateCommandEnabled(IDC_ZOOM_MINUS, CanZoomOut(contents));'''
NEW = '''  // Blanc's shipping zoom actions stay available and clamp in Zoom().
  const bool blanc_zoom = blanc_prototype::IsIslandWindow(browser_);
  command_updater_->UpdateCommandEnabled(IDC_ZOOM_PLUS,
                                         blanc_zoom || CanZoomIn(contents));
  command_updater_->UpdateCommandEnabled(IDC_ZOOM_NORMAL,
                                         blanc_zoom || CanResetZoom(contents));
  command_updater_->UpdateCommandEnabled(IDC_ZOOM_MINUS,
                                         blanc_zoom || CanZoomOut(contents));'''

def prepare(data: bytes) -> str:
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError('unexpected browser_command_controller.cc; refusing to stage')
    text = data.decode('utf-8')
    if text.count(OLD) != 1 or '#include "chrome/browser/ui/blanc_prototype_ui.h"' not in text:
        raise ValueError('unexpected command update block')
    new = text.replace(OLD, NEW, 1)
    return ''.join(difflib.unified_diff(text.splitlines(keepends=True),
        new.splitlines(keepends=True), fromfile='a/chrome/browser/ui/browser_command_controller.cc',
        tofile='b/chrome/browser/ui/browser_command_controller.cc'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('patch', type=Path)
    args = parser.parse_args()
    patch = prepare(args.input.read_bytes())
    with args.patch.open('x', encoding='utf-8') as output:
        output.write(patch)
    print('prepared patch sha256', hashlib.sha256(patch.encode()).hexdigest())

if __name__ == '__main__':
    main()
