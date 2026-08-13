# SQL Plan Visualizer

Understand SQL execution plans without deciphering intimidating text output. Paste an `EXPLAIN` result or select it in the editor and get an animated execution map with cost, row volume and actionable warnings.

## Features

- Automatic detection of MySQL, PostgreSQL, Oracle and SQLite plans.
- MySQL tabular and JSON plans, PostgreSQL JSON and text plans.
- Visual tree with curved edges whose thickness represents row volume.
- Risk coloring for large scans, expensive joins, filters and temporary sorts.
- Clickable recommendations and step-by-step execution animation.
- Zoom, node focus and a responsive light/dark VS Code interface.

## Usage

1. Open the Command Palette and run `SQL Plan Visualizer: Visualize EXPLAIN`.
2. Paste the plan output into the prompt.
3. Alternatively, select a plan in any editor and run `SQL Plan Visualizer: Visualize Selection` from the context menu.

JSON output is recommended because it preserves the complete hierarchy and metrics.

## Requirements

VS Code 1.125 or newer. The extension runs locally and does not send SQL or plans to an external service.

## Settings

- `sqlPlanVisualizer.animations`: Enable execution animations.
- `sqlPlanVisualizer.highlightMode`: Choose risk, cost or rows as the visual emphasis.
- `sqlPlanVisualizer.maxPlanDepth`: Maximum depth rendered for very large plans.

## Known Issues

Very large plans are better visualized by selecting them in an editor. SQL Server XML support is planned for a future release.

## Release Notes

### 0.1.0

Initial visual plan release with engine detection, parsing, analysis and animated SVG rendering.
