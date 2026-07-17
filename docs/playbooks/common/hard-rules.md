# [shared] Hard rules (both playbooks)

> Word-for-word identical in the add-model and add-app READMEs. Canonical here;
> each playbook links this file and adds only its OWN extra hard rules.

1. **Never hand-edit a workflow JSON.** Titles/values change in ComfyUI, then
   re-export. A manual edit is silently lost on the next export and the bug returns;
   hand-patching the API JSON also ships an off-by-one `widgets_values` (see the
   converter-staleness trap in [../add-model/01-workflow-split.md](../add-model/01-workflow-split.md) § 0a).
2. **A covered-but-asked question is a failure.** If the user tells you something a
   playbook already covers, that is a playbook failure or a reading failure — figure
   out which, and fix the playbook (or file a doc gap) if it is the former. Do not let
   the knowledge live only in the conversation.
