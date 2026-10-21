from pathlib import Path
import subprocess,json,os
src=Path('/Users/anthonyjloria/Projects/BlancChromium157/src');out=Path('/private/tmp/blanc-save-ack-plan');base='41520584daa68d0040db7746ae562a0ff82187f6';edits={}
def add(name,anchor,insert):
 s=edits.get(name,(src/name).read_text());assert s.count(anchor)==1,(name,anchor);edits[name]=s.replace(anchor,insert+anchor)
add('components/sessions/core/command_storage_backend.h','  bool inited_for_testing() const', '  // Flush previously appended commands; false if the current file is invalid.\n  bool FlushCurrentSession();\n\n')
add('components/sessions/core/command_storage_backend.cc','// static\nbool CommandStorageBackend::TimestampFromPath', '''bool CommandStorageBackend::FlushCurrentSession() {
  return open_file_ && open_file_->did_write_marker && open_file_->file->Flush();
}

''')
add('components/sessions/core/command_storage_manager.h','  bool HasPendingSave() const;', '  void SaveAndFlush(base::OnceCallback<void(bool)> callback);\n\n')
add('components/sessions/core/command_storage_manager.h','  // Called by the backend if writing to the file failed.', '  void FlushSavedCommands(base::OnceCallback<void(bool)> callback);\n\n')
add('components/sessions/core/command_storage_manager.cc','bool CommandStorageManager::HasPendingSave() const {', '''void CommandStorageManager::SaveAndFlush(base::OnceCallback<void(bool)> callback) {
  Save();
  FlushSavedCommands(std::move(callback));
}

void CommandStorageManager::FlushSavedCommands(
    base::OnceCallback<void(bool)> callback) {
  const auto stage = GetEncryptSessionStorageStage();
  const bool encrypted =
      stage == EncryptSessionStorageStage::kWriteBothReadPreferEncrypted ||
      stage == EncryptSessionStorageStage::kWriteEncryptedReadPreferEncrypted;
  if (encrypted && !encrypted_backend_) {
    pending_encrypted_ops_.push_back(base::BindOnce(
        &CommandStorageManager::FlushSavedCommands, weak_factory_.GetWeakPtr(),
        std::move(callback)));
    return;
  }
  auto backend = encrypted ? encrypted_backend_ : backend_;
  backend_task_runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(&CommandStorageBackend::FlushCurrentSession, backend),
      std::move(callback));
}

''')
add('chrome/browser/sessions/session_service_base.h','  void AddObserver(SessionServiceBaseObserver* observer);','  void SaveAndFlushSession(base::OnceCallback<void(bool)> callback);\n\n')
add('chrome/browser/sessions/session_service_base.cc','void SessionServiceBase::AddObserver(', '''void SessionServiceBase::SaveAndFlushSession(
    base::OnceCallback<void(bool)> callback) {
  command_storage_manager_->SaveAndFlush(std::move(callback));
}

''')
flags=['--text','--unified=0','--inter-hunk-context=0','--diff-algorithm=myers','--no-indent-heuristic','--no-renames','--no-ext-diff','--no-textconv','--no-color'];env={**os.environ,'GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_NOSYSTEM':'1'};rows=[];patch=[]
for n,s in edits.items():
 before=out/'before'/n;after=out/'after'/n;pristine=out/'pristine'/n
 for p in [before,after,pristine]:p.parent.mkdir(parents=True,exist_ok=True)
 before.write_bytes((src/n).read_bytes());after.write_text(s);pristine.write_bytes(subprocess.check_output(['git','-C',str(src),'show',base+':'+n]))
 def diff(a,b):return subprocess.run(['git','diff','--no-index',*flags,str(a),str(b)],env=env,capture_output=True,text=True).stdout
 old=diff(pristine,before);new=diff(pristine,after);delta=diff(before,after);patch.append(delta);rows.append(dict(path=n,new_file=not bool(old),before_hunks=old.count('\n@@'),after_hunks=new.count('\n@@')))
(out/'candidate.patch').write_text(''.join(patch));cost=dict(files=rows,projected_files=44+sum(x['new_file'] for x in rows),projected_hunks=107+sum(x['after_hunks']-x['before_hunks'] for x in rows),git=subprocess.check_output(['git','--version'],text=True).strip(),status='unapplied draft; not compiled or accepted');(out/'cost.json').write_text(json.dumps(cost,indent=2));print(json.dumps(cost,indent=2))
