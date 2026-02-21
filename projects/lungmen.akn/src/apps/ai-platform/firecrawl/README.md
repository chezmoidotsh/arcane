# Firecrawl - Architecture & Components

This directory contains the Kubernetes manifests required to deploy **Firecrawl**. Firecrawl is an API service designed to scrape, crawl, and extract clean markdown from websites, making it ideal for ingestion by Large Language Models (LLMs) via applications like Open-WebUI.

To ensure performance at scale, handle asynchronous processing of heavy requests (such as JavaScript rendering), and persist job queues, Firecrawl is divided into several interdependent microservices.

## 🧱 Components

Here is a technical breakdown of each component and its role:

1. **API (`firecrawl.api.yaml`)**:
   - The main entry point. It exposes the HTTP interfaces used by clients or applications (like Open-WebUI).
   - The API receives scrape and crawl requests, validates parameters, and pushes jobs into the message queues (Redis or Nuq).

2. **Classic Worker (`firecrawl.worker.yaml`)**:
   - The primary background processing unit.
   - It consumes jobs from the queue, downloads raw HTML content, converts it into markdown, and may call the Playwright service if the page requires JavaScript execution.

3. **Playwright Service (`firecrawl.playwright.yaml`)**:
   - This microservice runs a headless browser.
   - Its sole purpose is to open complex web pages that require dynamic rendering (e.g., React or Vue.js Single Page Applications), execute the JavaScript, and return the fully interpreted DOM to the Worker.

4. **Nuq Worker (`firecrawl.nuq-worker.yaml`)**:
   - *Nuq* is Firecrawl's custom-built queuing system, backed by PostgreSQL, designed to better manage job state and persistence at scale.
   - This worker is assigned specifically to process items pushed into the Nuq queues.

5. **PostgreSQL Nuq (`firecrawl.nuq-postgres.yaml`)**:
   - A local database provisioned exclusively to manage the persistent state of the *Nuq* queuing system.
   - This should not be confused with API persistence (which relies on disabled or local authentication depending on the configuration).

6. **Redis (`firecrawl.redis.yaml`)**:
   - A high-speed in-memory cache used by the application for managing ephemeral jobs (via BullMQ), rate limiting, and coordinating between the API and the standard Workers.

7. **SearXNG (`firecrawl.searxng.yaml`)**:
   - An embedded metasearch engine.
   - Firecrawl can use SearXNG to autonomously find web links using initial keywords before launching a deep crawl.

---

## 🔄 Interaction Diagram (Mermaid)

Below is a Mermaid diagram illustrating the data flow and the interaction between these components:

```mermaid
graph TD
    %% User Inputs / Web
    User([Clients / Open-WebUI]) -->|HTTP REST| API(Firecrawl API)
    
    %% API -> DBs / Queues
    API -->|Keywords Search| SearXNG{{SearXNG}}
    API -->|Redis (Rate Limit & BullMQ)| Redis[(Redis)]
    API -->|Persistent Nuq Queue| NuqPG[(Nuq Postgres)]
    
    %% Workers & Processing
    Redis <-->|Consumes Jobs| Worker(Classic Worker)
    NuqPG <-->|Manages State & Jobs| NuqWorker(Nuq Worker)
    
    %% Targeted JS Rendering
    Worker -->|JS DOM Rendering (SPA)| Playwright(Playwright Service)
    NuqWorker -->|JS DOM Rendering (SPA)| Playwright
```

## ⚙️ Global Configuration
The core configuration linking these components is defined in `firecrawl.configuration.yaml` (the ConfigMap):
- The workers and the API know how to interact with each other thanks to environment variables (`REDIS_URL`, `NUQ_DATABASE_URL`, `PLAYWRIGHT_MICROSERVICE_URL`).
- The URLs for local LLMs, which assist Firecrawl with vectorization and semantic extraction, are also defined here.

## ⚖️ Resource Limits & Trade-offs
Because `Nuq` (PostgreSQL and its dedicated Worker) is primarily needed for long, complex recursive crawls that require robust state persistence, it can be resource-intensive. 

In this deployment, **the resources for `nuq-postgres` and `nuq-worker` are intentionally limited**. 
Since our primary use case (e.g., feeding single pages to Open-WebUI) relies heavily on the fast, ephemeral Redis/BullMQ queue via the classic worker, we keep the Nuq components running to satisfy the API's hard dependencies (to prevent crash loops or connection errors), but we restrict their CPU and Memory requests to maintain a smaller overall cluster footprint.
