# Swiss Cheese Model

Focuses on how multiple defensive layers all failed simultaneously. Each "slice of cheese" is a control that should have
caught the problem but didn't — because its holes (gaps) lined up.

## How it works

A failure occurs when a hazard passes through the hole in _every_ defensive layer:

```mermaid
flowchart LR
    H(["Hazard"])

    L1["Layer 1\nCode review\n— skipped"]
    L2["Layer 2\nCI tests\n— inadequate"]
    L3["Layer 3\nStaging env\n— no access"]
    L4["Layer 4\nCanary deploy\n— no metrics"]

    F(["FAILURE"])

    H --> L1
    L1 -->|hole| L2
    L2 -->|hole| L3
    L3 -->|hole| L4
    L4 -->|holes aligned| F

    classDef layer   fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef hazard  fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef failure fill:#7f1d1d,color:#fff,stroke:#991b1b

    class L1,L2,L3,L4 layer
    class H hazard
    class F failure
```

No single hole is the root cause — it's the _alignment_ of holes across layers that matters.

## How to apply

1. List every defensive layer that should have prevented the failure.
2. For each layer, identify why it didn't catch the problem (the "hole").
3. Ask: was this hole **random** (bad luck, one-off) or **systemic** (process gap, missing tooling)?
4. Focus remediation on systemic holes — random holes don't justify restructuring, but systemic ones do.
5. Ask the deeper question: is there a structural reason multiple layers had gaps at the _same time_? (e.g., a release
   deadline that pressured all teams to skip checks simultaneously)

## When to use

- Near-misses where the failure _almost_ didn't happen
- Safety-critical incidents
- When explaining to a non-technical audience why redundancy didn't prevent failure
- When organizational culture around raising concerns is relevant (the "no one felt safe stopping the release" pattern)
- Multi-layer system failures (Kubernetes + CI/CD + monitoring + runbook)

## See also

- `fault-tree-analysis.md` — when you need to map the logic of failure precisely
- `five-whys.md` — drill deeper into why each individual layer had its hole
- `../SKILL.md` — technique selection table and full workflow
