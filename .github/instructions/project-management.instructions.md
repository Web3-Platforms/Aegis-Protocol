---
description: 'Keep the local project-management workspace synchronized and execution-ready'
applyTo: 'docs/project-management/**/*.md, docs/README.md'
---

# Project Management Workspace Rules

- `docs/project-management/AEGIS_PROJECT_WORKBOOK.md` is the editable roadmap source of truth.
- `docs/project-management/PROJECT_MANAGEMENT.xlsx` is the spreadsheet mirror. Regenerate it with `.github/scripts/sync_project_management_xlsx.py` after changing workbook structure, status, dependencies, milestones, or weekly reporting content.
- Preserve ticket keys, owners, priorities, statuses, dependencies, milestones, and the weekly update template.
- Record progress as status movement, notes, or changelog entries instead of deleting planning history.
- Keep the workflow visible in the artifacts: Think -> Plan -> Organize -> Implement -> Review -> Report -> Document -> Maintain.
- Keep the workbook focused on real operations, truthful product scope, and revenue path.
