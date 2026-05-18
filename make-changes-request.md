# Make Changes Request Guide

This guide explains how another engineer can set up the repo on a company laptop, open a PR, merge it, and recover quickly if GitHub buttons are missing.

## 1. First-Time Setup on Company Laptop

### 1.1 Prerequisites

- Company GitHub account has access to the repository.
- SSO is authorized for the organization if your org requires it.
- Git is installed.

### 1.2 Clone the Company Repository

~~~powershell
git clone https://github.com/genesiscare-eu/engineering.git
cd engineering
git remote -v
~~~

Expected: origin points to https://github.com/genesiscare-eu/engineering.git.

### 1.3 If You Need to Transfer Work From a Personal Laptop

On personal laptop:

~~~powershell
git checkout corp-transfer-repo
git status
git add -A
git commit -m "Transfer latest changes"   # only if needed
git bundle create lina-corp-transfer-repo.bundle corp-transfer-repo
git bundle verify lina-corp-transfer-repo.bundle
~~~

Copy lina-corp-transfer-repo.bundle to your work laptop.

On work laptop (inside the cloned company repo):

~~~powershell
git fetch C:\path\to\lina-corp-transfer-repo.bundle corp-transfer-repo:corp-transfer-repo
git checkout corp-transfer-repo
git push -u origin corp-transfer-repo
~~~

## 2. Create a Branch and Push Changes

If starting from main:

~~~powershell
git checkout main
git pull --ff-only origin main
git checkout -b feature/short-description
~~~

After edits:

~~~powershell
git add -A
git commit -m "Describe the change"
git push -u origin feature/short-description
~~~

## 3. Create a Pull Request (Web UI)

1. Open the repo in GitHub.
2. Go to Pull requests.
3. Select New pull request.
4. Set base to main.
5. Set compare to your branch (for example corp-transfer-repo or feature/short-description).
6. Review the compare diff.
7. Click Create pull request.
8. Add title and description.
9. Submit PR.

Important: The compare screen is expected. It is the preview step before Create pull request.

## 4. Merge the Pull Request

1. Wait for required checks/reviews.
2. Open the PR page.
3. Click Merge pull request (or Squash and merge / Rebase and merge, based on team policy).
4. Confirm merge.
5. Optionally delete branch.
6. Sync local main:

~~~powershell
git checkout main
git pull --ff-only origin main
~~~

## 5. Why You Might Not See Create or Merge Buttons

### 5.1 No Create Pull Request button

Common causes:

- No diff between base and compare branches.
- Base and compare are reversed.
- Branch is not pushed to origin.
- Wrong account is signed in.
- Missing repository permissions.
- Organization SSO is required but not authorized for your session.

Quick checks:

~~~powershell
git fetch origin
git branch -vv
git log --oneline origin/main..origin/corp-transfer-repo
~~~

If the last command returns nothing, there are no commits to merge from that branch.

### 5.2 No Merge button on an existing PR

Common causes:

- Required checks not passed.
- Required reviewer approvals missing.
- PR is in Draft state.
- Merge conflicts must be resolved first.
- Branch protection blocks your merge role.

Fix:

- Pass checks.
- Get required approvals.
- Mark Ready for review if draft.
- Resolve conflicts.
- Ask a maintainer with merge permission.

## 6. Fastest No-PR Fallback (Use Only If Policy Allows)

Use this only when direct pushes to main are allowed and branch protection does not require PRs.

~~~powershell
git fetch origin
git checkout main
git pull --ff-only origin main
git merge --no-ff corp-transfer-repo -m "Merge corp-transfer-repo into main"
git push origin main
~~~

If there are conflicts, resolve them locally, commit, then push.

## 7. Recommended Safe Default

If unsure, always use the PR flow.
It leaves review history, keeps auditability, and usually matches corporate branch protection rules.
