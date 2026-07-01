# Execution Mode Hierarchy

This document defines the relationships between execution modes and provides guidance on mode selection.

## Mode Inheritance Tree

```
autopilot (autonomous end-to-end)
├── includes: ralph (persistence)
│   └── includes: ultrawork (parallelism)
├── includes: ultraqa (QA cycling)
└── includes: plan (strategic thinking)

 (token efficiency ONLY)
└── modifies: agent tier selection (prefer haiku/sonnet)
    (does NOT include persistence - that's ralph's job)

ralph (persistence wrapper)
└── includes: ultrawork (parallelism engine)
    (adds: loop until done + architect verification)

ultrawork (parallelism engine)
└── COMPONENT only - parallel agent spawning
    (no persistence, no verification loop)
```

## Mode Relationships

| Mode | Type | Includes | Mutually Exclusive With |
|------|------|----------|------------------------|
| autopilot | Standalone | ralph, ultraqa, plan | - |
| ralph | Wrapper | ultrawork | - |
| ultrawork | Component | - | - |
|  | Modifier | - | - |
| ultraqa | Component | - | - |

## Decision Tree

```
Want autonomous execution?
├── YES: Is task parallelizable into 3+ independent components?
│   ├── YES: team N:executor (parallel autonomous with file ownership)
│   └── NO: autopilot (sequential with ralph phases)
└── NO: Want parallel execution with manual oversight?
    ├── YES: Do you want cost optimization?
    │   ├── YES:  + ultrawork
    │   └── NO: ultrawork alone
    └── NO: Want persistence until verified done?
        ├── YES: ralph (persistence + ultrawork + verification)
        └── NO: Standard orchestration (delegate to agents directly)

Have many similar independent tasks (e.g., "fix 47 errors")?
└── YES: team N:executor (N agents claiming from task pool)
```

## Mode Differentiation Matrix

| Mode | Best For | Parallelism | Persistence | Verification | File Ownership |
|------|----------|-------------|-------------|--------------|----------------|
| autopilot | "Build me X" | Via ralph | Yes | Yes | N/A |
| team | Multi-component/homogeneous | N workers | Per-task | Per-task | Per-task |
| ralph | "Don't stop" | Via ultrawork | Yes | Mandatory | N/A |
| ultrawork | Parallel only | Yes | No | No | N/A |
|  | Cost savings | Modifier | No | No | N/A |

## Quick Reference

**Just want to build something?** → `autopilot`
**Building multi-component system?** → `team N:executor`
**Fixing many similar issues?** → `team N:executor`
**Want control over execution?** → `ultrawork`
**Need verified completion?** → `ralph`
**Want to save tokens?** → `` (combine with other modes)

## Combining Modes

Valid combinations:
- `eco ralph` = Ralph loop with cheaper agents
- `eco ultrawork` = Parallel execution with cheaper agents
- `eco autopilot` = Full autonomous with cost optimization

Invalid combinations:
- `autopilot team` = Mutually exclusive (both are standalone)
- `` alone = Not useful (needs an execution mode)

## State Management

### Standard Paths
All mode state files use standardized locations:
- Primary: `.omq/state/{name}.json` (local, per-project)
- Global backup: `~/.omq/state/{name}.json` (global, session continuity)

### Mode State Files
| Mode | State File |
|------|-----------|
| ralph | `ralph-state.json` |
| autopilot | `autopilot-state.json` |
| ultrawork | `ultrawork-state.json` |
|  | `-state.json` |
| ultraqa | `ultraqa-state.json` |
| pipeline | `pipeline-state.json` |

**Important:** Never store OMQ state in `~/.qoder/` - that directory is reserved for Qoder CLI itself.

Legacy locations are auto-migrated on read.
