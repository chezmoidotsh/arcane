# Arcane page templates

One template file per page type. Copy it, delete the comments, keep the section order. Pages are written in French (see
the "Language" section of the [style guide](style-guide.md)) and every page ends with `## Pour aller plus loin`. Where a
page lives and how it is named is in the [style guide](style-guide.md#naming-and-navigation).

| Page type        | Template                                                                                                                                      | What it is                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Guide            | [guide-template.md](guide-template.md)                                                                                                        | Takes a reader from a starting point to a result. Links to references for values.                  |
| Reference        | [reference-template.md](reference-template.md)                                                                                                | Answers "what is the value of X?". A table or a list, and the only place that states those values. |
| Procedure        | [procedure-template.md](procedure-template.md), with the rules in [procedure.md](procedure.md)                                                | Literal, replayable steps.                                                                         |
| ADR              | [adr-template.md](adr-template.md), with the rules in [adr.md](adr.md)                                                                        | Records a decision and why.                                                                        |
| Post-mortem      | [postmortem.md](../templates/postmortem.md) or [postmortem-lite.md](../templates/postmortem-lite.md), rules in [postmortem.md](postmortem.md) | Tells what happened and why.                                                                       |
| Experiment       | [experiment-template.md](experiment-template.md)                                                                                              | Records a question, what was tried and what was concluded. The code stays in the repository.       |
| Project overview | [project-template.md](project-template.md)                                                                                                    | One per project under `projects/`. The project `README.md` stays next to the code and links here.  |

All the templates (procedure, ADR, post-mortem) are in French. The post-mortem front matter keys and values, and the
action syntax (`[due:: …]`), are not translated: the `.github/scripts/postmortem-*.py` scripts read them.

A procedure, an ADR or a post-mortem also gets the shared frame: a title that matches the file name, a short first
paragraph, and `## Pour aller plus loin` as the last section.
