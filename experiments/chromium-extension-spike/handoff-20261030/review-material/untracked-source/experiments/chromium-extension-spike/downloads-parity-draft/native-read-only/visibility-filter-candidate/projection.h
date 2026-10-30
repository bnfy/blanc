#ifndef BLANC_DOWNLOADS_NATIVE_PROJECTION_DRAFT_H_
#define BLANC_DOWNLOADS_NATIVE_PROJECTION_DRAFT_H_
#include <cstdint>
#include <string>
#include <vector>
#include "base/unguessable_token.h"
#include "scope.h"
class Profile;
namespace blanc::downloads_projection {
// INTERNAL ONLY: GUID is not a renderer row handle. No URLs with paths,
// raw filesystem paths or actionable capabilities are returned.
struct InternalRow {
  std::string guid;
  std::u16string filename;
  std::string source_origin;
  int state;
  int danger_type;
  int insecure_status;
  int danger_ui_pattern;
  bool dangerous;
  bool insecure;
  bool can_resume;
  int64_t received_bytes;
  int64_t total_bytes;
  int64_t started_ms;
  bool private_item;
};
enum class Status { kReady, kDenied, kPending, kInvalid };
struct Result { Status status = Status::kDenied; std::vector<InternalRow> rows; };
// All inputs, including both epochs and history_ready, are browser-owned.
// The future owner must rotate the matching epoch before manager/context
// teardown and authenticate its caller before reaching this internal helper.
// No pointer or token may be renderer-provided. Run on the owning UI sequence.
Result ReadManager(Profile* regular_owner, Scope scope,
                   const base::UnguessableToken& expected_epoch,
                   const base::UnguessableToken& current_epoch,
                   bool regular_history_ready);
}
#endif
