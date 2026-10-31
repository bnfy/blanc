# Harness maintenance — October 26, 2026

Executable harness copies now send dynamic URL/body values through the existing `Runtime.callFunctionOn` argument helper instead of constructing JavaScript. Historical run outputs and assertions are unchanged; this maintenance is not a new native runtime pass. Each modified script's exact original bytes are retained in its adjacent `.original.gz` archive, and both copies are covered by `SHA256SUMS`. The original copies remain evidence only and are not executed. The signed app is unchanged.
