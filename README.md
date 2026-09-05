# Testiny Browser Snippets

Small DevTools snippets that improve Testiny reporting and project-user administration without requiring browser extensions.

These scripts run only in the current Testiny tab and use the authenticated Testiny session already present in the browser. They don't store credentials or send data outside the Testiny server.

## Installation

Chrome and Edge save DevTools snippets locally:

1. Open Testiny and sign in.
2. Open DevTools with `F12` or `Ctrl+Shift+I`.
3. Open **Sources** and select **Snippets** in the left panel.
4. Select **New snippet** and give it a descriptive name.
5. Paste the contents of the required JavaScript file.
6. Save with `Ctrl+S`.
7. Run with `Ctrl+Enter` while the relevant Testiny page is open.

A snippet must be run again after a full page reload or after opening Testiny in another tab.

## Milestone Results Dashboard

File: `testiny_milestone_quality_rates.js`

Run this snippet on a milestone page such as:

```text
https://testiny.example.com/PROJECT/milestones/ms/123
```

It adds:

- Success Rate and Failure Rate to the milestone ribbon.
- Not Run percentage to the ribbon.
- Hoverable information icons with formulas and live counts.
- A milestone-level donut chart aggregating every linked manual test run.
- A six-state legend for Passed, Failed, Blocked, Skipped, Not Run, and In Progress.
- Automatic refresh every 30 seconds and support for in-app milestone navigation.

The formulas are:

```text
Completion Rate = Total executed / Total manual tests * 100
Success Rate    = Passed / Total executed * 100
Failure Rate    = Failed / Total executed * 100
Not Run         = Not run / Total manual tests * 100
```

`Total executed` excludes Not Run and In Progress results. The donut legend percentages use all manual-test instances as their denominator, matching Testiny's native test-run chart.

To remove the enhancement without reloading:

```javascript
window.__testinyQualityRates?.stop()
```

## Milestone Ribbon Rates

File: `testiny_milestone_ribbon_rates.js`

This is the lightweight milestone alternative. It adds Success Rate, Failure Rate, and Not Run to the existing milestone ribbon, including formula tooltips, but does not add the larger donut-chart panel.

Use either this snippet or `testiny_milestone_quality_rates.js` on a milestone page. Running one automatically removes the other because they share the same lifecycle controller.

To remove the enhancement without reloading:

```javascript
window.__testinyQualityRates?.stop()
```

## User Role Highlighter

File: `testiny_user_role_highlighter.js`

Run this snippet from a project's **Users** tab to preserve Testiny's original table while visually distinguishing effective roles:

- Administrators and owners: purple.
- Editors: amber.
- Run testers and executors: blue.
- Viewers: green.
- No access: dimmed.

| Run Tester highlighting | Viewer highlighting |

The highlighter reads the **Effective role** column, so users who inherit access remain categorized correctly. It follows dynamically rendered rows while scrolling.

To remove the highlighting without reloading:

```javascript
window.__testinyRoleHighlighter?.stop()
```

## Project Access Dashboard

File: `testiny_project_access_filter.js`

Run this snippet from a project's **Users** tab, for example:

```text
https://testiny.example.com/settings/projects/pr/123/edit
```

It replaces the large virtualized tenant-user table with a compact project-access dashboard:

- Users with no effective project access are omitted.
- Elevated roles are grouped first.
- Viewers are grouped separately below them.
- Owner, tenant administrator, project administrator, editor, run editor, tester, executor, and viewer roles are supported.
- Direct project roles, tenant administrators, and permission-group assignments are included.
- Deleted profiles are excluded.
- Name, email address, role, and account status are shown in a dense responsive grid.
- Editable users have a direct-role selector and an explicit **Save** button.
- The colored role label shows the effective role; the selector changes only the direct project role.
- Removing a direct role does not remove access inherited through a permission group.
- The project owner and tenant administrators remain locked because Testiny manages them at organization level.
- Data refreshes every 30 seconds and follows in-app project navigation.

Role changes are applied immediately when a card's **Save** button is selected. Testiny's project-user quota validation still applies.

To restore Testiny's original Users table without reloading:

```javascript
window.__testinyAccessFilter?.stop()
```

## Compatibility

The snippets currently target the Testiny Server UI and API behavior observed in September 2026. Testiny UI or API updates may require selector or endpoint adjustments.

Use these scripts only in environments where you are authorized to view the underlying project and user data.

## Validation

All snippet files are standalone JavaScript and can be syntax-checked with Node.js:

```powershell
node --check .\testiny_milestone_quality_rates.js
node --check .\testiny_milestone_ribbon_rates.js
node --check .\testiny_project_access_filter.js
node --check .\testiny_user_role_highlighter.js
```
