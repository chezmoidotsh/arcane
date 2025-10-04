---
name: ":bug: Bug Report (AI Agent)"
about: Report a bug or issue in the infrastructure (AI agent version)
title: ":bug:(scope): Brief description of the issue"
labels: bug
---

<!--
AI GUIDANCE: This template is optimized for AI agents reporting infrastructure bugs.

KEY PRINCIPLES:
1. Be factual and specific - avoid speculation in Observable Behavior
2. Include actual error messages, logs, and command outputs
3. Provide complete reproduction steps that anyone can follow
4. Document investigation already performed
5. Replace <scope> with actual scope (project:amiya.akn, catalog:crossplane, etc.)

SCOPE SELECTION GUIDANCE:
- project:amiya.akn / project:lungmen.akn / etc: Cluster-specific issues
- catalog:crossplane / catalog:kustomize / etc: Catalog component issues
- gh: GitHub workflows, templates, repository issues
- deps: Dependency-related problems

TECHNICAL CONTEXT:
- Include kubectl commands and their output when relevant
- Provide ArgoCD sync status for deployment issues
- Include network policy details for connectivity problems
- Check OpenBao/External Secrets for secret-related issues
- Verify Cilium network connectivity for networking bugs
- Check Envoy Gateway/HTTPRoute for ingress issues

IMPORTANT: Fill the "AI Analysis Placeholder" section with your analysis if you have
insights about root cause or potential solutions.
-->

> \[!NOTE]
> **TLDR**: <!-- One sentence: "[Component] [fails/errors] when [condition], causing [impact]" -->

## Context

<!-- AI: Provide complete environment context. This helps narrow down the root cause. -->

**Affected Component:**

* Scope: <!-- AI: Use exact scope format from .commitlintrc.js -->
* Cluster: <!-- AI: Specify cluster name (amiya.akn, lungmen.akn, etc.) -->
* Namespace: <!-- AI: Kubernetes namespace where the issue occurs -->
* Application/Service: <!-- AI: Name and version (use `kubectl get deployment -n <ns> <name> -o yaml | grep image:`) -->

**Environment Details:**

* GitOps Tool: <!-- AI: ArgoCD for all active clusters -->
* Kubernetes Distribution: <!-- AI: Talos Linux for all active clusters -->
* Kubernetes Version: <!-- AI: Run `kubectl version --short` -->
* Related Infrastructure: <!-- AI: List relevant infrastructure (Crossplane, Cilium, Envoy, OpenBao, etc.) -->

## Problem Description

**Observable Behavior:**

<!-- AI: Describe EXACTLY what is happening. Include:
     - Specific error messages (verbatim)
     - Pod/resource status (CrashLoopBackOff, Pending, Failed, etc.)
     - Observable symptoms (timeouts, 404s, connection refused, etc.)
     - When the issue started (timestamp if known)
     Be factual - do not speculate about causes here.
-->

**Expected Behavior:**

<!-- AI: Describe what SHOULD happen in normal operation.
     Reference documentation or previous working state if possible.
-->

**Impact Assessment:**

<!-- AI: Check [x] all that apply. Be realistic about severity. -->

* [ ] Service unavailable/degraded <!-- Users cannot access or use the service -->
* [ ] Data integrity issue <!-- Data loss, corruption, or inconsistency -->
* [ ] Security concern <!-- Potential vulnerability or security breach -->
* [ ] Performance degradation <!-- Service works but slower than expected -->
* [ ] Deployment blocked <!-- Cannot deploy or sync changes -->
* [ ] Other: <!-- Specify other impacts -->

## Reproduction Steps

<!-- AI: Provide complete, executable steps that anyone can follow to reproduce the bug.
     Include exact commands, not just descriptions.
     Example:
     1. Deploy application: `kubectl apply -f app.yaml`
     2. Check pod status: `kubectl get pods -n namespace`
     3. Observe error in logs: `kubectl logs -n namespace pod-name`
-->

1.
2.
3.

**Reproduction Frequency:**

<!-- AI: Specify if this happens Always / Intermittent / Once -->

## System Information

**Logs:**

```shell
# AI: Paste ACTUAL logs from the affected component. Include:
     - Container/pod logs: kubectl logs -n <ns> <pod> --tail=100
     - Previous crashed container: kubectl logs -n <ns> <pod> --previous
     - ArgoCD app logs: argocd app logs <app-name> --tail=100
     - Include timestamps
     - DO NOT truncate error messages - include the full stack trace
-->
```

**Resource Status:**

```bash
# AI: Paste ACTUAL command output, not just example commands. Include:
# - Pod status: kubectl get pods -n <namespace>
# - Resource details: kubectl describe <type> <name> -n <namespace>
# - Events: kubectl get events -n <namespace> --sort-by='.lastTimestamp'
# - ArgoCD status: argocd app get <app-name> (if applicable)
```

**Configuration:**

```yaml
# AI: Include RELEVANT configuration that might be related to the bug.
# Common sources:
# - kubectl get <resource> -n <ns> <name> -o yaml
# - Helm values or Kustomize overlays
# - ConfigMaps or environment variables
# IMPORTANT: Redact any secrets, passwords, or API keys!
```

**Network Policies / Routes:**

<!-- AI: For networking issues, include:
     - CiliumNetworkPolicy: kubectl get cnp -n <namespace>
     - HTTPRoute/Gateway: kubectl get httproute,gateway -n <namespace>
     - Service/Endpoints: kubectl get svc,endpoints -n <namespace>
-->

## Investigation Notes

<!-- AI: Document troubleshooting already performed. This avoids duplicate work. -->

**Already Tried:**

* [ ] Checked application logs <!-- kubectl logs -->
* [ ] Verified resource status (pods, deployments, etc.) <!-- kubectl get/describe -->
* [ ] Checked ArgoCD sync status <!-- argocd app get -->
* [ ] Reviewed recent commits/changes <!-- git log -->
* [ ] Verified secrets synchronization (External Secrets Operator) <!-- kubectl get externalsecrets -->
* [ ] Checked network connectivity (Cilium, Envoy Gateway) <!-- cilium connectivity test -->
* [ ] Other: <!-- List additional investigation steps taken -->

**Findings:**

<!-- AI: Document what you discovered:
     - Patterns in logs
     - Timing correlations (e.g., "Issue started after commit abc123")
     - Related resources that are also failing
     - Potential root causes identified
-->

## AI Analysis Placeholder

<!--
AI GUIDANCE: If you can provide analysis, fill this section with your findings.
Use the format below to structure your analysis.
-->

### AI Analysis - \[Date] - \[AI Model]

**Root Cause Hypothesis:**

<!-- AI: Based on logs, symptoms, and investigation, what do you think is causing this?
     Be clear about confidence level and what evidence supports your hypothesis.
-->

**Suggested Resolution:**

<!-- AI: Provide specific, actionable steps to fix the issue:
     1. Exact commands to run
     2. Configuration changes needed
     3. Resources to update
     Include verification steps after each action.
-->

**Additional Considerations:**

<!-- AI: Note any:
     - Related issues that might be connected
     - Dependencies that need to be addressed first
     - Risks or side effects of the suggested fix
     - Follow-up work that may be needed
-->

**Confidence Level:** <!-- High / Medium / Low based on available evidence -->

## Additional Context

<!-- AI: Include any context not covered above that might be relevant. -->

**Related Issues/PRs:**

<!-- AI: Link to:
     - Duplicate or similar issues
     - Related PRs that might have introduced this
     - Upstream issues in dependencies
-->

**References:**

<!-- AI: Provide helpful references:
     - Relevant documentation
     - Stack Overflow discussions
     - GitHub issues in upstream projects
     - Error code documentation
-->

***

<sub>Issue created by AI under human supervision</sub>
