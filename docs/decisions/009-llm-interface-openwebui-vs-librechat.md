<!--
status: "proposed"
date: 2026-02-26
decision-makers: ["Alexandre"]
consulted: []
informed: []
-->

# Choose LLM Interface: OpenWebUI over LibreChat

## Context and Problem Statement

I am currently setting up a complete stack to host and use Large Language Models (LLMs) that will be hosted locally. To interact with these models effectively, I need a WebUI that allows me to make requests and interact with them seamlessly. The platform must be strictly self-hosted in a Kubernetes environment.

### Critical Problems Identified

I require an interface that provides a strictly local AI experience (Full Local), ensuring zero outbound data leaks while supporting advanced, modern LLM features. Specifically, the integration with a local inference engine (like LMStudio) is mandatory for both text generation and embeddings.

### Strategic Question

Should I adopt LibreChat or OpenWebUI as my front-end LLM interface to meet my strict locality, RAG, and MCP requirements, without sacrificing community support and feature velocity?

## Decision Drivers

### Functional Requirements

*   **Deployment Constraints**: Strictly self-hosted (Kubernetes).
*   **Confidentiality / Privacy**: "Full Local" required (absolute zero outgoing data).
*   **Core Capabilities**: Must support Model Context Protocol (MCP), Retrieval-Augmented Generation (RAG), and model personalization.

### Non-Functional Requirements

*   **Pérennité (Longevity)**: Must have a strong community foundation to keep pace with rapid AI evolutions (OpenAI API standard compliance, tool integrations).

## Considered Options

### Option 1: LibreChat (LC)

LibreChat is a prominent, feature-rich interface known for its complex chaining capabilities and structure.

*   **Pros:**
    *   **Accessibility:** UI is simpler and more intuitive for end-users.
    *   **Agents & Chaining:** Highly advanced agent system allowing complex chaining scenarios (currently impossible to natively reproduce in OpenWebUI).
    *   **Configuration Management:** "Configuration as Code" approach via YAML (excellent for infrastructure versioning).
    *   **User Flexibility:** Allows users to inject their own API keys; excellent visual grouping of models by provider.
    *   **Tool Customization:** Highly granular (icons, names, descriptions).
*   **Cons:**
    *   **Critical Block: Incompatibility with LMStudio (Embeddings):** Rejects embedding requests with Error 400. LMStudio expects raw text (strings), but LibreChat's libraries force an incompatible formatting. This completely breaks a "Full Local" RAG setup based on LMStudio.
    *   **OCR Limitations:** OCR functionalities are hard-coupled to third-party services (Google, Mistral, OpenAI), violating the "Full Local" requirement.
    *   **Infrastructure Footprint:** Heavier architecture (despite the Postgres JSON warnings being minor, the overall stack is heavier to maintain).

### Option 2: OpenWebUI (OWU)

OpenWebUI is a popular interface that tightly integrates with various backends and focuses on providing an all-in-one local offering.

*   **Pros:**
    *   **RAG Capabilities:** Much simpler to stabilize in a local environment; less friction regarding input/output formats.
    *   **Infrastructure Footprint:** Lighter footprint on the Kubernetes cluster compared to the full LibreChat stack.
*   **Cons:**
    *   **Agent System:** Too simplistic compared to LibreChat; lacks complex chaining features.
    *   **Model Management:** Missing visual grouping by providers; the interface becomes messy when managing a large number of models.
    *   **UI/UX Configuration:** Lacks visual customization for MCPs (icons) and does not easily allow user-injected API keys via the interface.

## Decision Outcome

**Chosen option:** "OpenWebUI", because it is the only option that successfully meets the "Full Local" knockout criterion—specifically regarding local RAG/embeddings via LMStudio. LibreChat's forced library formatting makes it fundamentally incompatible with LMStudio for embedding generation, breaking the core confidentiality requirement. OpenWebUI addresses all basic prerequisites (Local execution, simple UI, MCP) with a lighter footprint, with the expectation that its high update velocity will bridge the gap regarding its agent capabilities in the medium term.

### Consequences

#### Positive Consequences
*   ✅ **Compliance:** Absolute guarantee of data confidentiality by enabling a 100% Full Local workflow (inference + embeddings + OCR).
*   ✅ **Stability:** Simpler and more reliable local RAG implementation.
*   ✅ **Resource Efficiency:** Lighter infrastructure footprint for the AI stack in the Kubernetes cluster.

#### Negative Consequences
*   ⚠️ **UI Limitations:** Users and administrators must tolerate degraded model organization (no provider-based sorting).
*   ⚠️ **Feature Gap (Temporary):** Sacrifice of complex multi-agent chaining capabilities until OpenWebUI catches up.
*   ⚠️ **Configuration Friction:** Loss of "Configuration as Code" for certain application-level settings compared to LibreChat's YAML structures.

#### Neutral Consequences
*   📝 **Monitoring:** Need to monitor the OpenWebUI roadmap closely for agent updates to mitigate the current feature gap.

## References and Further Reading

### Technical Documentation
*   [OpenWebUI Documentation](https://docs.openwebui.com/)
*   [LibreChat Documentation](https://www.librechat.ai/docs)
*   [LM Studio](https://lmstudio.ai/)
*   [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

## Changelog

* **2026-02-26**: **FEATURE**: Initial creation of this ADR outlining the decision to use OpenWebUI over LibreChat.
