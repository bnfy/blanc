# OpenSSF Baseline Level 3 plan — October 19, 2026

Status: **planned, nothing applied.** Branch protection still requires zero
approving reviews, and Blanc still has one human maintainer.

## Where Blanc stands

Blanc's [Level 3 self-assessment](https://www.bestpractices.dev/en/projects/14451/baseline-3)
under baseline version 2026.08.28 records 20 of the 21 Level 3 controls as met.
That version is the current one, and all 21 controls are new at Level 3. The
one control not met is:

> **OSPS-QA-07.01** — When a commit is made to the primary branch, the
> project's version control system MUST require at least one non-author human
> approval of the changes before merging.

Nothing else blocks the Level 3 badge. Like Level 2, it is a voluntary
self-assessment, not a certification or an independent audit, and the website
must keep describing it that way (`docs/openssf-baseline-badge-2026-09-04.md`).

## What meeting QA-07.01 takes

- **A second human with write access.** GitHub counts an approval toward the
  required count only when it comes from an account with write access to
  `bnfy/blanc`.
- **One required approval on `main`.** Administrators are already subject to
  the rule (`enforce_admins` is on), so the owner cannot merge their own pull
  request without the reviewer.
- **The approval must cover the final code.** Stale approvals are already
  dismissed. Adding `require_last_push_approval` also stops a push made after
  approval from merging unreviewed.

These do **not** meet the control, and the project must not use them:

- A second GitHub account controlled by the owner. That would be the author
  approving their own change, and recording it as met would be a false
  self-assessment.
- Approvals from AI agents, GitHub Apps, or Dependabot. They are not human.
- A bypass list, or skipping review for website-only or documentation-only
  changes. The control covers every commit to the primary branch.

## Choosing the reviewer

`docs/governance.md` already sets the bar for anyone who gets merge-affecting
access. Before the invitation, the owner verifies and records:

1. the reviewer's real identity, independently of their GitHub profile;
2. a sustained history of contributions or review relevant to Blanc;
3. that MFA is enabled on their GitHub account;
4. that they will review promptly enough for the project's pace (see below).

The reviewer gets the **Write** role only. The reviewer gets no admin role and
no access to Actions secrets, security advisories, signing, notarization,
Cloudflare, 1Password, or the support mailbox. Two reviewers are better than
one: with a single reviewer, any absence stops every merge, including a
security hotfix, because nothing can bypass the rule.

## Effect on day-to-day work

- **Volume.** More than 200 pull requests merged between October 12 and
  October 19, 2026. Each one, including website copy, Dependabot updates and
  agent-authored changes, will wait for the reviewer.
- **Auto-merge still works.** An armed pull request merges once it has the
  approval and its required checks pass.
- **Releases are unaffected.** `scripts/release.sh` pushes only the release
  tag (`git push origin "refs/tags/$TAG"`), which is outside the branch rule.
  The post-release records already go through pull requests, so they will
  wait for the reviewer like any other change.
- **No workflow pushes to `main`**, so no automation breaks.
- **Agents cannot merge.** Claude and Codex sessions already open pull requests
  as `bnfy`, so the reviewer must approve each one before it can merge.

## Rollout, in order

1. **Pick and verify the reviewer** (above).
2. **Record the decision.** In a pull request, add the reviewer to the
   *Roles and responsibilities* table in `docs/governance.md`. List their
   name, login, the Write role and the date they were verified, and replace
   the note saying the role is planned. Merge it before inviting them; the
   governance policy requires the record before access is granted.
3. **Invite the reviewer with the Write role**, and confirm they accepted:

   ```
   gh api -X PUT repos/bnfy/blanc/collaborators/<reviewer-login> -f permission=push
   gh api repos/bnfy/blanc/collaborators --jq '.[] | "\(.login) \(.role_name)"'
   ```

4. **Require one approval.** This changes only the review settings and leaves
   the required checks, conversation resolution and admin enforcement as they
   are:

   ```
   gh api -X PATCH repos/bnfy/blanc/branches/main/protection/required_pull_request_reviews \
     -F required_approving_review_count=1 \
     -F dismiss_stale_reviews=true \
     -F require_last_push_approval=true \
     -F require_code_owner_reviews=false
   ```

5. **Read it back** and keep the output for the record:

   ```
   gh api repos/bnfy/blanc/branches/main/protection \
     --jq '{reviews: .required_pull_request_reviews, admins: .enforce_admins.enabled, conversations: .required_conversation_resolution.enabled, checks: .required_status_checks.contexts}'
   ```

   Expect `required_approving_review_count: 1`,
   `require_last_push_approval: true`, `dismiss_stale_reviews: true` and
   `admins: true`.

6. **Prove the rule works** with a trivial pull request. Before approval,
   `gh pr merge` must be refused. After the reviewer approves, it must merge.
   Then push a commit after an approval and confirm the merge is refused
   again.
7. **Record the evidence** in a follow-up pull request:
   - a new dated safeguards record next to
     `docs/security-project-safeguards-2026-09-04.md`, with the read-back
     output and the test pull request numbers;
   - `CONTRIBUTING.md` → *Pull requests and review*: every pull request needs
     an approval from a maintainer other than its author;
   - the `.bestpractices.json` entry for `osps_qa_07_01`, set to `Met` with a
     justification naming the rule and linking the new safeguards record.
8. **Update the assessment** on bestpractices.dev (QA-07.01 → Met) and
   confirm that the project page awards Level 3.
9. **Only after the badge is awarded,** update the public claims together:
   snapshot the official badge as `site/public/openssf-baseline-3.svg`, update
   the Security page, the badge on Privacy & Security, the claims ledger and
   `docs/openssf-baseline-badge-2026-09-04.md`, and the README badge. Follow
   `docs/marketing-claims.md`; the copy still says *self-assessment*.

## Undoing it

If the reviewer leaves or the pace proves unworkable, restore the previous
settings, and record that QA-07.01 is unmet again on bestpractices.dev and in
`.bestpractices.json`. The Level 3 badge then lapses, and any public Level 3
claim must come down in the same change.

```
gh api -X PATCH repos/bnfy/blanc/branches/main/protection/required_pull_request_reviews \
  -F required_approving_review_count=0 \
  -F dismiss_stale_reviews=true \
  -F require_last_push_approval=false \
  -F require_code_owner_reviews=false
```

Remove the reviewer's access in the same change, and update
`docs/governance.md`.
