# Pareto Analysis on Historical Incidents

If this is the third or fourth similar failure, stop analyzing individual incidents and analyze the _pattern_.

## How it works

1. Collect the last 5-10 similar failures.
2. Categorize each incident's root cause.
3. Rank categories by frequency.
4. Check whether \~80% of incidents trace back to \~20% of causes.

The goal is to find the systemic issue that individual post-mortems keep dancing around.

## How to apply

1. List the historical incidents in a table:

| Incident | Date | Root cause category | Brief description |
| -------- | ---- | ------------------- | ----------------- |

2. Group by root cause category and count.
3. The top 1-2 categories are where remediation effort should concentrate.
4. Ask: "What structural condition produces all these incidents?" That's the meta-root-cause.

## When to use

- Recurring failures that resist individual post-mortem fixes
- When leadership asks "why does this keep happening"
- When the current post-mortem feels like it's covering ground you've seen before

## See also

- `five-whys.md` — once you've identified the dominant category, drill into its root cause
- `ishikawa.md` — useful for categorizing causes across domains before ranking them
- `../SKILL.md` — technique selection table and full workflow
