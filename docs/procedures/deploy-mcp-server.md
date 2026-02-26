# Procedure: Deploying and Managing MCP Servers (ToolHive)

## 📌 Context
The **Model Context Protocol (MCP)** connects AI applications to external tools and data sources. In Arcane, the **ToolHive Operator** manages MCP servers. 

ToolHive abstracts Kubernetes complexities (Deployments, Services, RBAC) into Custom Resources (`MCPServer` and `VirtualMCPServer`). This procedure explains how to create, secure, and expose new MCP servers so AI interfaces like Open-WebUI or n8n can reach them at `ai.chezmoi.sh/mcp/*`.

---

## 🏗 Requirements
- Access to the Arcane repository.
- A running ToolHive Operator in the cluster.
- Valid API Keys/Secrets (if the MCP server requires them) stored as Kubernetes Secrets or via External-Secrets.

Add all new MCP server manifests to:
`projects/lungmen.akn/src/apps/ai-platform/mcp-servers/`

---

## 🛠 Procedure: Deploying a Basic MCP Server

### Step 1: Provide Secrets (If Required)
If your MCP server requires API keys (e.g., a GitHub Token), pass them via a Secret. Create a native secret temporarily, or wait for your external secret to sync before deploying the MCPServer.

**Example Secret** (Native Kubernetes):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: github-mcp-secret
  namespace: open-webui
stringData:
  token: "ghp_XXXXXXXXXXXXXXXXXXXX"
```

### Step 2: Create the `MCPServer` Resource
Create a YAML file (e.g., `mcp-servers/github.yaml`) to configure your MCP server.

```yaml
apiVersion: toolhive.stacklok.dev/v1alpha1
kind: MCPServer
metadata:
  name: github
spec:
  # The MCP image
  image: ghcr.io/github/github-mcp-server:latest
  transport: stdio
  # Internal ports exposed by the ToolHive Proxy
  proxyPort: 8080
  mcpPort: 8080
  
  # Inject target Secrets safely:
  secrets:
    - name: github-mcp-secret
      key: token
      targetEnvName: GITHUB_PERSONAL_ACCESS_TOKEN
      
  # Plaintext Environment Variables:
  env:
    - name: LOG_LEVEL
      value: "info"
      
  # Standardize Pod Resources
  resources:
    requests:
      cpu: "50m"
      memory: "64Mi"
    limits:
      cpu: "200m"
      memory: "256Mi"
```

### Step 3: Register in Kustomization
Add the new file to `mcp-servers/kustomization.yaml`:
```yaml
resources:
  - fetch.yaml
  - github.yaml
```
Commit and sync. The ToolHive operator will start the proxy pod. The internal DNS for the proxy becomes `mcp-github-proxy.ai-platform.svc.cluster.local:8080`.

---

## 🌐 Procedure: Expose MCP Servers Externally

External AI Agents need a stable API endpoint. Expose them using **Gateway API (HTTPRoute)** under the domain `ai.chezmoi.sh`, routing them through path prefixes `/mcp/*`.

### Routing Rules

Create `mcp-servers/mcp-httproute.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: toolhive-mcp-routes
  namespace: open-webui
spec:
  parentRefs:
    - name: envoy-gateway      # Must point to your cluster's gateway
      namespace: envoy-system
  hostnames:
    - "ai.chezmoi.sh"
  rules:
    # Route for the 'Fetch' MCP
    - matches:
        - path:
            type: PathPrefix
            value: /mcp/fetch
      filters:
        # Crucial: Strip the `/mcp/fetch` prefix. 
        # The internal ToolHive proxy expects the root path (/).
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /
      backendRefs:
        - name: mcp-fetch-proxy   # Toolhive names proxies mcp-<name>-proxy
          port: 8080
          
    # Route for the 'GitHub' MCP
    - matches:
        - path:
            type: PathPrefix
            value: /mcp/github
      filters:
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /
      backendRefs:
        - name: mcp-github-proxy
          port: 8080
```

Add `mcp-httproute.yaml` to your Kustomization. Open-WebUI now connects to your cluster MCPs at `https://ai.chezmoi.sh/mcp/github`.

---

## 🎯 Procedure: Aggregating via Virtual MCPs (vMCP)

A **Virtual MCP Server (vMCP)** bundles multiple backend MCP servers into a single endpoint. 

**Why use a vMCP?**
- It provides a single URL (`/mcp/all`) instead of multiple.
- It filters dangerous tools (e.g., exposing only `read_repository` from GitHub while hiding `write_issue`).

### Deploy a vMCP

Create `mcp-servers/virtual-hub.yaml`:

```yaml
apiVersion: toolhive.stacklok.dev/v1alpha1
kind: VirtualMCPServer
metadata:
  name: hub
spec:
  aggregation:
    # Expose everything from Fetch
    - mcpServerRef:
        name: fetch
        
    # Expose GitHub, but ONLY allow specific read tools
    - mcpServerRef:
        name: github
      filters:
        include: 
          - "search_repositories"
          - "get_file_contents"
```
The Virtual Server launches a proxy named `mcp-hub-proxy`. Add this proxy to your HTTPRoute under `/mcp/hub`. AI agents then access your curated hub instead of the raw backend MCPs.

---

## 🛡️ Security: Enforce Network Policies

MCP servers execute tools that make network connections (HTTP requests, SSH, Database queries). Attackers could use vulnerable AI loops to attempt **SSRF (Server-Side Request Forgery)** against internal Cluster IPs.

**Apply these Network Policies:**

1. **Ingress (Incoming)**
   - Allow only your **Ingress Controller** (Envoy/Traefik) or internal AI services (Open-WebUI) to reach `port: 8080` on pods labeled `app.kubernetes.io/managed-by: toolhive-operator`.
   
2. **Egress (Outgoing)**
   - **BLOCK ALL intra-cluster Egress** (e.g., block access to `10.96.0.0/16` and internal DB namespaces).
   - **ALLOW DNS:** Open `TCP/UDP 53` to CoreDNS.
   - **ALLOW Internet:** Open outbound connections to external public IPs (`0.0.0.0/0` excluding private IP ranges `10.0.0.0/8`, `192.168.0.0/16`) for MCPs like `fetch` or `github`.

### Identifying Target Pods
Toolhive labels the proxy and MCP pods with:
- `app.kubernetes.io/managed-by: toolhive-operator`
- `toolhive.stacklok.dev/mcpserver: <mcp-name>`
