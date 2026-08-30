#!/usr/bin/env bash
#
# Atlas: deploy, then mirror the source into the public repo and push.
#
# Usage:
#   ad                          build and deploy the live site (nothing else)
#   ad --deploy                 …and also sync the repo, commit and push
#   ad --deploy "some message"  …with your own commit message
#   ad --sync-only              sync, commit and push without rebuilding
#
# Git is opt-in on purpose: most deploys are quick iterations you do not want a
# commit for. The live app and the git repo are two separate folders — the repo
# is a public-facing copy with its own README, LICENCE and no real config — so
# `--deploy` is what keeps them from drifting apart.
#
# `npm run deploy` now does four things in order, and the order matters:
#
#   1. build
#   2. verify the public bundle (scripts/check-bundle.mjs) — aborts if anything
#      belonging to the conversation reached the pre-unlock chunks
#   3. deploy hosting        → the `site` project alias
#   4. deploy Firestore rules → the `data` project alias
#
# Hosting and data live in different Firebase projects: the public site needed
# its own domain, and adding a second Hosting site to an existing project
# requires the paid plan, whereas a whole second project on the free plan does
# not. Both aliases are in .firebaserc. Set them to the same id and it behaves
# exactly as it used to.

set -euo pipefail

# Resolved from this script's own location rather than hardcoded, so moving or
# renaming the project folder cannot break the deploy. It was hardcoded once and
# broke the moment the folder moved, which is a silly way to lose ten minutes.
LIVE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$LIVE/atlas-oss"

DO_DEPLOY=1
DO_GIT=0
MESSAGE=""

for arg in "$@"; do
  case "$arg" in
    --deploy) DO_GIT=1 ;;
    --sync-only) DO_GIT=1; DO_DEPLOY=0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) MESSAGE="$arg" ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }

cd "$LIVE" || fail "Project folder not found: $LIVE"

# --- 1. deploy -------------------------------------------------------------
# Runs first and must succeed. Pushing code that does not build would put a
# broken commit in the repo and leave the live site fine — the worst pairing,
# because nothing visibly breaks to tell you.

if [ "$DO_DEPLOY" -eq 1 ]; then
  bold "→ Building and deploying…"
  npm run deploy || fail "✗ Deploy failed — nothing was pushed to git."
  bold "✓ Deployed"
fi

if [ "$DO_GIT" -eq 0 ]; then
  bold "✓ Done — repo not touched (use 'ad --deploy' to sync and push)"
  exit 0
fi

[ -d "$REPO/.git" ] || fail "✗ No git repo at $REPO"

# The public repo now also carries src/cover — the notes site, and with it the
# fact that this app has a front door at all, plus the unlisted route the
# passphrase screen lives on. None of that is a security boundary (the route
# 404s unless a passphrase genuinely needs establishing, and the passphrase is
# what actually protects anything), but publishing it does hand a reader the
# premise for free. Said out loud once here rather than buried in a commit.
printf '\033[1;33m! The repo copy includes the cover site (src/cover).\033[0m\n'
printf '  Anyone reading it learns the site has a hidden half. Ctrl-C now if that matters.\n'
sleep 3

# --- 2. mirror the source into the repo ------------------------------------
# Excludes everything that is either private (real config), generated (build
# output, dependencies) or intentionally different in the public copy (README,
# LICENCE, SECURITY).

bold "→ Syncing source into atlas-oss…"
rsync -rc \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.firebase/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.firebaserc' \
  --exclude='LICENSE' \
  --exclude='SECURITY.md' \
  --exclude='README.md' \
  --exclude='scripts/' \
  src public index.html firestore.rules firestore.indexes.json firebase.json \
  package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json \
  vite.config.ts vitest.config.ts eslint.config.js .prettierrc.json ARCHITECTURE.md \
  "$REPO/" || fail "✗ Sync failed"

cd "$REPO"

# --- 3. refuse to commit anything sensitive --------------------------------
# .gitignore already covers these, so this is a second pair of eyes rather than
# the only defence. It costs nothing and the failure mode it guards against —
# a leaked key in public git history — is permanent.

LEAKS=$(git status --porcelain --untracked-files=all \
        | grep -iE ' ([^ ]*/)?(\.env|\.env\..+|\.firebaserc|[^ ]*serviceaccount[^ ]*\.json|[^ ]+\.pem|[^ ]+\.key)$' \
        | grep -v '\.env\.example$' || true)
if [ -n "$LEAKS" ]; then
  printf '\033[1;31m✗ Refusing to commit — sensitive files are staged:\033[0m\n%s\n' "$LEAKS" >&2
  exit 1
fi

# --- 4. commit and push ----------------------------------------------------

if [ -z "$(git status --porcelain)" ]; then
  bold "✓ Repo already up to date — nothing to commit"
  exit 0
fi

echo
git status --short
echo

if [ -z "$MESSAGE" ]; then
  MESSAGE="Update Atlas — $(date '+%d %b %Y, %H:%M')"
fi

git add -A
git commit -q -m "$MESSAGE"
bold "→ Pushing…"
git push -q || fail "✗ Push failed (commit is saved locally; fix and 'git push')"

bold "✓ Pushed: $MESSAGE"
