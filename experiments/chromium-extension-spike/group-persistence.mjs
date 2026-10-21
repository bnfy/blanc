// Append-only closed-group metadata: older records default to expanded, and
// older readers ignore the new trailing field.
export function prepareGroupPersistence(edit) {
  edit('components/sessions/core/tab_restore_service_impl.cc', [
    {
      anchor: '  // When restoring a single closed group, always restore it in its expanded\n  // state so the user can immediately see the restored tabs. Oppositely, Window\n  // and session restoration preserve the collapsed state in\n  // kCommandSetTabGroupData to match the last state that user left the browser\n  // in.\n  group->visual_data = tab_groups::TabGroupVisualData(\n      fields.title, fields.color, /*is_collapsed=*/false);',
      replacement: '  // Blanc: optional trailing collapse flag; legacy records stay expanded.\n  bool is_collapsed = false;\n  std::ignore = it.ReadBool(&is_collapsed);\n  group->visual_data = tab_groups::TabGroupVisualData(\n      fields.title, fields.color, is_collapsed);',
      present: '// Blanc: optional trailing collapse flag; legacy records stay expanded.',
    },
    {
      anchor: '  pickle.WriteInt64(timestamp.ToDeltaSinceWindowsEpoch().InMicroseconds());\n\n  std::unique_ptr<SessionCommand> command =\n      std::make_unique<SessionCommand>(kCommandCreateGroup, pickle);',
      replacement: '  pickle.WriteInt64(timestamp.ToDeltaSinceWindowsEpoch().InMicroseconds());\n  // Blanc: append without changing the existing closed-group record prefix.\n  pickle.WriteBool(visual_data.is_collapsed());\n\n  std::unique_ptr<SessionCommand> command =\n      std::make_unique<SessionCommand>(kCommandCreateGroup, pickle);',
      present: '// Blanc: append without changing the existing closed-group record prefix.',
    },
  ]);
}
