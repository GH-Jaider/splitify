# Splitify

**Turn messy, uncommitted changes into clean, atomic commits.**

AI-assisted coding tools have changed the way we work. A single session with Copilot can touch dozens of files across multiple concerns -- a new feature, a refactor, a bug fix, and a config tweak, all mixed together in your working tree. The result? Developers commit everything as one giant blob, and the commit history becomes unreadable.

Splitify fixes this. It analyzes your uncommitted changes using GitHub Copilot, groups related files by intent, suggests meaningful commit messages that match your project's style, and lets you commit each group independently -- all without leaving VS Code.

## Features

### Analyze & Group Changes

Run **Splitify: Analyze & Group Changes** from the Command Palette or the SCM title bar. Splitify reads your diffs, sends them to your chosen AI model, and organizes files into logical, atomic commit groups -- each with a suggested commit message.

<!-- ![Analyze changes](images/analyze.png) -->

### Commit Groups View

After analysis, a **Splitify - Commit Groups** tree view appears in the Source Control panel. Each group shows its commit message and the files it contains. From here you can:

- **Commit** a single group or all groups at once
- **Select groups with checkboxes** and commit only the selected ones
- **Edit** the suggested commit message before committing
- **Discard** groups you don't want
- **Drag and drop** files between groups to reorganize
- **Move** or **remove** individual files from groups
- **Create** new groups manually and add ungrouped files to them

### Ungrouped Files

If the AI misses a file or you remove one from a group, it appears in an **Ungrouped Files** section at the bottom of the tree view. You can add these files to any existing group with one click.

### Commit Message Style Matching

Splitify reads your recent commit history and instructs the AI to match your project's existing commit message format, prefix style, and tone. The result is commit messages that look like yours, not generic AI output.

### Configurable AI Model

By default Splitify uses `gpt-4o` through GitHub Copilot's language model API. You can switch to any available model:

- Run **Splitify: Select AI Model** from the Command Palette (or press `Ctrl+Alt+M` / `Cmd+Alt+M`)
- Pick from a list of all models available through your Copilot subscription
- Your choice is remembered across sessions

### Pre-Commit Hook Strategies

Splitify respects your pre-commit hooks with three strategies:

| Strategy             | Behavior                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `run-once` (default) | Runs hooks once for all files before committing groups           |
| `run-per-group`      | Runs hooks on each individual group commit (slower but thorough) |
| `skip`               | Skips all pre-commit hooks                                       |

### Ignore Patterns

Exclude files from analysis using glob patterns. Useful for lock files, build artifacts, or anything you don't want Splitify to consider:

```json
"splitify.ignorePatterns": ["*.lock", "dist/**", "*.min.js"]
```

## Requirements

- **VS Code** 1.85 or later
- **GitHub Copilot** extension (Splitify uses Copilot's language model API -- a Copilot subscription is required)

## Extension Settings

| Setting                      | Default    | Description                                                          |
| ---------------------------- | ---------- | -------------------------------------------------------------------- |
| `splitify.maxFilesPerGroup`  | `10`       | Maximum files to include in a single commit group                    |
| `splitify.showNotifications` | `true`     | Show notifications after commits                                     |
| `splitify.preCommitStrategy` | `run-once` | How to handle pre-commit hooks (`run-once`, `run-per-group`, `skip`) |
| `splitify.ignorePatterns`    | `[]`       | Glob patterns for files to exclude from analysis                     |

## Commands

| Command                           | Description                                          | Keybinding   |
| --------------------------------- | ---------------------------------------------------- | ------------ |
| Splitify: Analyze & Group Changes | Analyze uncommitted changes and create commit groups | --           |
| Splitify: Commit This Group       | Commit a single group                                | --           |
| Splitify: Commit All Groups       | Commit all groups sequentially                       | --           |
| Splitify: Commit Selected Groups  | Commit only the checked groups                       | --           |
| Splitify: Edit Commit Message     | Edit a group's commit message                        | --           |
| Splitify: Discard Group           | Remove a group                                       | --           |
| Splitify: Move to Another Group   | Move a file to a different group                     | --           |
| Splitify: Remove from Group       | Remove a file from its group                         | --           |
| Splitify: Create New Group        | Create an empty group manually                       | --           |
| Splitify: Add to Group            | Add an ungrouped file to an existing group           | --           |
| Splitify: Refresh Analysis        | Re-run analysis on current changes                   | --           |
| Splitify: Select AI Model         | Choose which AI model to use                         | `Ctrl+Alt+M` |

## Known Issues

- Very large changesets (50+ files with long diffs) may be truncated to fit within the model's context window. Consider committing in smaller batches.
- The extension requires an active GitHub Copilot subscription. Without one, model selection will show no available models.

## Release Notes

### 0.0.1

Initial release:

- AI-powered change analysis and grouping
- Tree view with inline actions for commit, edit, and discard
- Checkbox selection for batch committing
- Drag-and-drop file reorganization between groups
- Ungrouped files tracking and management
- Configurable AI model selection
- Pre-commit hook strategies
- Commit message style matching from repository history
- File ignore patterns
