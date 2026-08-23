# Project Documentation

Documentation in this folder describes **what exists**, not what was planned. If a
file here describes something that is not built, it is a defect in the documentation,
not a preview of the roadmap.

Planned work lives in `user-stories/` and `08-board.md`. Decisions live in
`decisions/`. This folder is for a reader who wants to understand or run the system as
it currently is.

## Contents

```text
documentation/
├── api/
│   ├── overview.md         Endpoints, conventions, and how to explore them
│   └── error-handling.md   The error contract and what each status means
└── development/
    ├── setup.md            Running the system from a clean clone
    ├── testing.md          Running and writing tests
    ├── localization.md     Adding a string, adding a language, RTL rules
    └── git-workflow.md     Branching, commits, and pull requests
```

Only files that exist are listed. Sections are added when the thing they describe is
built.

## Maintenance rule

Documentation is updated in the same story that changes the behaviour, by the Summary
role, before the story can be Done. Documentation updated "later" is documentation
that is wrong for however long later takes.
