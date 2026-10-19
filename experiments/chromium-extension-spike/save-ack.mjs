export function prepareSaveAcknowledgement(edit) {
  edit("components/sessions/core/command_storage_backend.h", [
  {
    "anchor": "\n  bool inited_for_testing() const { return inited_; }\n",
    "replacement": "\n  // Flush previously appended commands; false if the current file is invalid.\n  bool FlushCurrentSession();\n\n  bool inited_for_testing() const { return inited_; }\n",
    "present": "\n  // Flush previously appended commands; false if the current file is invalid.\n  bool FlushCurrentSession();\n\n  bool inited_for_testing() const { return inited_; }\n"
  }
]);
  edit("components/sessions/core/command_storage_backend.cc", [
  {
    "anchor": "// static\nbool CommandStorageBackend::TimestampFromPath(const base::FilePath& path,\n",
    "replacement": "bool CommandStorageBackend::FlushCurrentSession() {\n  return open_file_ && open_file_->did_write_marker && open_file_->file->Flush();\n}\n\n// static\nbool CommandStorageBackend::TimestampFromPath(const base::FilePath& path,\n",
    "present": "bool CommandStorageBackend::FlushCurrentSession() {\n  return open_file_ && open_file_->did_write_marker && open_file_->file->Flush();\n}\n\n// static\nbool CommandStorageBackend::TimestampFromPath(const base::FilePath& path,\n"
  }
]);
  edit("components/sessions/core/command_storage_manager.h", [
  {
    "anchor": "  bool HasPendingSave() const;\n\n",
    "replacement": "  void SaveAndFlush(base::OnceCallback<void(bool)> callback);\n\n  bool HasPendingSave() const;\n\n",
    "present": "  void SaveAndFlush(base::OnceCallback<void(bool)> callback);\n\n  bool HasPendingSave() const;\n\n"
  },
  {
    "anchor": "\n  // Called by the backend if writing to the file failed.\n",
    "replacement": "\n  void FlushSavedCommands(base::OnceCallback<void(bool)> callback);\n\n  // Called by the backend if writing to the file failed.\n",
    "present": "\n  void FlushSavedCommands(base::OnceCallback<void(bool)> callback);\n\n  // Called by the backend if writing to the file failed.\n"
  }
]);
  edit("components/sessions/core/command_storage_manager.cc", [
  {
    "anchor": "bool CommandStorageManager::HasPendingSave() const {\n  return weak_factory_for_timer_.HasWeakPtrs();\n",
    "replacement": "void CommandStorageManager::SaveAndFlush(base::OnceCallback<void(bool)> callback) {\n  Save();\n  FlushSavedCommands(std::move(callback));\n}\n\nvoid CommandStorageManager::FlushSavedCommands(\n    base::OnceCallback<void(bool)> callback) {\n  const auto stage = GetEncryptSessionStorageStage();\n  const bool encrypted =\n      stage == EncryptSessionStorageStage::kWriteBothReadPreferEncrypted ||\n      stage == EncryptSessionStorageStage::kWriteEncryptedReadPreferEncrypted;\n  if (encrypted && !encrypted_backend_) {\n    pending_encrypted_ops_.push_back(base::BindOnce(\n        &CommandStorageManager::FlushSavedCommands, weak_factory_.GetWeakPtr(),\n        std::move(callback)));\n    return;\n  }\n  auto backend = encrypted ? encrypted_backend_ : backend_;\n  backend_task_runner_->PostTaskAndReplyWithResult(\n      FROM_HERE,\n      base::BindOnce(&CommandStorageBackend::FlushCurrentSession, backend),\n      std::move(callback));\n}\n\nbool CommandStorageManager::HasPendingSave() const {\n  return weak_factory_for_timer_.HasWeakPtrs();\n",
    "present": "void CommandStorageManager::SaveAndFlush(base::OnceCallback<void(bool)> callback) {\n  Save();\n  FlushSavedCommands(std::move(callback));\n}\n\nvoid CommandStorageManager::FlushSavedCommands(\n    base::OnceCallback<void(bool)> callback) {\n  const auto stage = GetEncryptSessionStorageStage();\n  const bool encrypted =\n      stage == EncryptSessionStorageStage::kWriteBothReadPreferEncrypted ||\n      stage == EncryptSessionStorageStage::kWriteEncryptedReadPreferEncrypted;\n  if (encrypted && !encrypted_backend_) {\n    pending_encrypted_ops_.push_back(base::BindOnce(\n        &CommandStorageManager::FlushSavedCommands, weak_factory_.GetWeakPtr(),\n        std::move(callback)));\n    return;\n  }\n  auto backend = encrypted ? encrypted_backend_ : backend_;\n  backend_task_runner_->PostTaskAndReplyWithResult(\n      FROM_HERE,\n      base::BindOnce(&CommandStorageBackend::FlushCurrentSession, backend),\n      std::move(callback));\n}\n\nbool CommandStorageManager::HasPendingSave() const {\n  return weak_factory_for_timer_.HasWeakPtrs();\n"
  }
]);
  edit("chrome/browser/sessions/session_service_base.h", [
  {
    "anchor": "  void AddObserver(SessionServiceBaseObserver* observer);\n  void RemoveObserver(SessionServiceBaseObserver* observer);\n",
    "replacement": "  void SaveAndFlushSession(base::OnceCallback<void(bool)> callback);\n\n  void AddObserver(SessionServiceBaseObserver* observer);\n  void RemoveObserver(SessionServiceBaseObserver* observer);\n",
    "present": "  void SaveAndFlushSession(base::OnceCallback<void(bool)> callback);\n\n  void AddObserver(SessionServiceBaseObserver* observer);\n  void RemoveObserver(SessionServiceBaseObserver* observer);\n"
  }
]);
  edit("chrome/browser/sessions/session_service_base.cc", [
  {
    "anchor": "}\n\nvoid SessionServiceBase::AddObserver(SessionServiceBaseObserver* observer) {\n",
    "replacement": "}\n\nvoid SessionServiceBase::SaveAndFlushSession(\n    base::OnceCallback<void(bool)> callback) {\n  command_storage_manager_->SaveAndFlush(std::move(callback));\n}\n\nvoid SessionServiceBase::AddObserver(SessionServiceBaseObserver* observer) {\n",
    "present": "}\n\nvoid SessionServiceBase::SaveAndFlushSession(\n    base::OnceCallback<void(bool)> callback) {\n  command_storage_manager_->SaveAndFlush(std::move(callback));\n}\n\nvoid SessionServiceBase::AddObserver(SessionServiceBaseObserver* observer) {\n"
  }
]);
}
