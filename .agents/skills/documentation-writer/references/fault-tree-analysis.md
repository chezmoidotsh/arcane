# Fault Tree Analysis

Top-down, deductive technique. Start with the failure event, then decompose into contributing conditions using AND/OR
logic gates.

## How it works

AND gate: **all** child conditions must be true for the parent to occur. OR gate: **any** child condition alone is
sufficient.

```mermaid
graph TD
    F(["Deploy failed"])

    F --> G1{AND}
    G1 --> CE["Config error"]
    G1 --> CODE["Code error"]

    CE --> G2{OR}
    G2 --> ENV(["Missing env var"])
    G2 --> VAL(["Wrong value"])

    CODE --> G3{OR}
    G3 --> NT(["No tests in pipeline"])
    G3 --> INSUF(["Tests insufficient"])

    classDef root  fill:#fca5a5,stroke:#dc2626,color:#7f1d1d
    classDef gate  fill:#e0e7ff,stroke:#6366f1,color:#3730a3
    classDef leaf  fill:#bbf7d0,stroke:#16a34a,color:#14532d

    class F root
    class G1,G2,G3 gate
    class ENV,VAL,NT,INSUF leaf
```

**Reading the tree:** red = top-level failure; blue = logic gates; green = leaf nodes (atomic, observable conditions —
these are the potential root causes).

This structure makes gaps in monitoring and control visible — each leaf node either _is_ a root cause or maps to a
control that should have prevented it.

## How to apply

1. State the failure event at the top.
2. Ask: "What conditions could cause this?" Decompose into immediate sub-causes.
3. For each sub-cause, classify the relationship: AND (all required) or OR (any sufficient).
4. Repeat decomposition until you reach atomic, observable leaf conditions.
5. Identify which leaf nodes represent systemic gaps (missing controls, absent ownership, outdated processes) — those
   are the candidates for root causes and action items.

## When to use

- Engineering or system failures with clear component boundaries
- When you need to communicate the failure logic to a technical audience
- When building preventive controls — the tree maps directly to monitoring and alerting rules
- Infrastructure or deployment incidents in a Kubernetes/cloud context

## See also

- `five-whys.md` — simpler first pass for linear cause chains
- `swiss-cheese-model.md` — when the focus is on which defensive layers failed
- `../SKILL.md` — technique selection table and full workflow
