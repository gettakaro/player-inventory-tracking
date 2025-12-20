# Claude Code Instructions

## Git Worktrees for Parallel Development

When working on a new feature, consider using a git worktree. This allows multiple AI agent sessions to work on different features simultaneously without conflicts.

### When to use worktrees
- Starting work on a new feature that might conflict with other ongoing work
- Multiple agent sessions need to work in parallel

### When NOT to use worktrees
- Small changes or fixes
- Working on the same feature as another session
- Quick one-off tasks

### Commands
```bash
# Create a new worktree for a feature
git worktree add ../feature-name -b feature/feature-name

# List existing worktrees
git worktree list

# Remove a worktree when done (after merging)
git worktree remove ../feature-name
```
