from pathlib import Path
import hashlib,json
r=Path('/private/tmp/blanc-session-recovery');p=Path('/Users/anthonyjloria/Projects/BlancChromium157/src/components/os_crypt/async/browser/os_crypt_async.cc');s=p.read_text();(r/'provider.original').write_text(s)
rec={};f='components/os_crypt/async/browser/os_crypt_async.cc';rec[f]={'original':hashlib.sha256(s.encode()).hexdigest()}
s='#include <cstdio>\n#include <cstdlib>\n#include "base/environment.h"\n#include "base/task/single_thread_task_runner.h"\n#include "base/time/time.h"\n'+s
needle='  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);\n\n  CHECK(!tag.empty())'
insert='''  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  const std::string mode = base::Environment::Create()->GetVar("BLANC_ENCRYPTION_FAULT").value_or("");
  if (mode == "never") {
    fprintf(stderr, "BLANC_PROVIDER withheld\\n");
    return;
  }
  static bool delayed = false;
  if (mode == "delay" && !delayed) {
    delayed = true;
    fprintf(stderr, "BLANC_PROVIDER delay_begin\\n");
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
        FROM_HERE, base::BindOnce(&OSCryptAsync::HandleKey,
            weak_factory_.GetWeakPtr(), current, tag, std::move(key)),
        base::Seconds(20));
    return;
  }
  if ((mode == "temporary" ||
               mode == "permanent")) {
    fprintf(stderr, "BLANC_PROVIDER failure temporary=%d\\n", mode == "temporary");
    key = base::unexpected(mode == "temporary"
        ? KeyProvider::KeyError::kTemporarilyUnavailable
        : KeyProvider::KeyError::kPermanentlyUnavailable);
  }
  fprintf(stderr, "BLANC_PROVIDER completion success=%d\\n", key.has_value());

  CHECK(!tag.empty())'''
assert needle in s;s=s.replace(needle,insert,1);p.write_text(s);rec[f]['diagnostic']=hashlib.sha256(s.encode()).hexdigest();(r/'source.json').write_text(json.dumps(rec,indent=2))
