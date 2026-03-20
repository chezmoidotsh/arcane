#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "rich==13.7.1",
#     "questionary==2.0.1",
# ]
# ///

import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

try:
    import questionary
    from rich.console import Console
    from rich.table import Table
except ImportError:
    print("Dependencies missing. Please install them with 'uv pip install -r requirements.txt' or run with 'uv run'.")
    sys.exit(1)

console = Console()

# ===== CONFIGURATION =====
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

PATH_REGEX = re.compile(r'^projects/([^/]+)/src/(apps|infrastructure/kubernetes)/(.+)$')
YAML_PATH_REGEX = re.compile(r'^projects/([^/]+)/src/(apps|infrastructure/kubernetes)/(.+)\.ya?ml$')

HOSTNAME_REGEX = re.compile(r'[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+\.[a-zA-Z]+')
ARGOCD_REGEX = re.compile(r'argocd\.[a-zA-Z0-9.-]+\.[a-zA-Z]+')

COMMON_URL_PATTERNS = [
    "https://argocd.{cluster_name}.chezmoi.sh",
    "https://argocd.akn.chezmoi.sh",
    "https://argocd.chezmoi.sh",
]

ARGOCD_CLI = "argocd"
REPO_URL = "https://github.com/chezmoidotsh/arcane.git"
DEFAULT_DEST_SERVER = "https://kubernetes.default.svc"
SYNC_TIMEOUT = "300"

def run_cmd(cmd: list[str], check=True, capture=True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, check=check, capture_output=capture, text=True)
    except FileNotFoundError:
        console.print(f"[bold red]Error:[/bold red] Command '{cmd[0]}' not found.")
        sys.exit(1)

def check_dependencies(*tools: str):
    missing = []
    for tool in tools:
        if not shutil.which(tool):
            missing.append(tool)
    if missing:
        console.print(f"[bold red]Missing required tools:[/bold red] {', '.join(missing)}. Please install them to continue.")
        sys.exit(1)

def check_git_repo():
    res = run_cmd(["git", "rev-parse", "--git-dir"], check=False)
    if res.returncode != 0:
        console.print("[bold red]Error:[/bold red] You must be in a Git repository.")
        sys.exit(1)

def get_current_branch() -> str:
    res = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    branch = res.stdout.strip()
    if branch == "HEAD":
        res = run_cmd(["git", "rev-parse", "HEAD"])
        branch = res.stdout.strip()
        console.print(f"[yellow]In detached mode, using SHA:[/yellow] {branch}")
    else:
        console.print(f"[blue]Current branch:[/blue] {branch}")
    return branch

def normalize_path(path_str: str) -> str:
    p = Path(path_str)
    if path_str == ".":
        p = Path.cwd()

    if not p.is_absolute():
        p = p.resolve()

    if not p.exists():
        console.print(f"[bold red]Error:[/bold red] Path '{path_str}' does not exist.")
        sys.exit(1)

    try:
        rel_p = p.relative_to(PROJECT_ROOT)
        return str(rel_p)
    except ValueError:
        return str(p)

def parse_yaml_path(yaml_path: str) -> dict:
    norm_path = normalize_path(yaml_path)
    if not re.search(r'\.(yaml|yml)$', norm_path):
        console.print(f"[bold red]Error:[/bold red] File '{yaml_path}' is not a YAML file.")
        sys.exit(1)

    match = YAML_PATH_REGEX.match(norm_path)
    if not match:
        console.print("[bold red]Invalid path format.[/bold red]")
        console.print("Expected: projects/<cluster>/src/apps/<app>/<file>.yaml")
        console.print("Or: projects/<cluster>/src/infrastructure/kubernetes/<app>/<file>.yaml")
        console.print(f"Resolved path: '{norm_path}'")
        sys.exit(1)

    cluster, app_type, _ = match.groups()
    yaml_p = Path(norm_path)
    app_dir = yaml_p.parent
    app_name = app_dir.name.lstrip('*')
    app_project = "system" if app_type == "infrastructure/kubernetes" else "applications"

    return {
        "yaml_path": norm_path,
        "cluster_name": cluster,
        "app_type": app_type,
        "app_path": str(app_dir),
        "app_name": app_name,
        "app_project": app_project
    }

def parse_app_path(app_path: str) -> dict:
    norm_path = normalize_path(app_path)
    abs_path = PROJECT_ROOT / norm_path
    if not abs_path.is_dir():
        console.print(f"[bold red]Error:[/bold red] Path '{app_path}' is not a directory.")
        sys.exit(1)

    match = PATH_REGEX.match(norm_path)
    if not match:
        console.print("[bold red]Invalid path format.[/bold red]")
        console.print("Expected: projects/<cluster>/src/apps/<app>")
        console.print("Or: projects/<cluster>/src/infrastructure/kubernetes/<app>")
        console.print(f"Resolved path: '{norm_path}'")
        sys.exit(1)

    cluster, app_type, app_name = match.groups()
    app_name = app_name.lstrip('*')
    app_project = "system" if app_type == "infrastructure/kubernetes" else "applications"

    return {
        "app_path": norm_path,
        "cluster_name": cluster,
        "app_name": app_name,
        "app_project": app_project,
        "app_type": app_type
    }

def determine_context(cluster_name: str) -> str:
    kube_context = os.environ.get("KUBE_CONTEXT")
    if kube_context:
        console.print(f"[blue]Using environment context:[/blue] {kube_context}")
        return kube_context

    res = run_cmd(["kubectl", "config", "get-contexts", "-o", "name"], check=False)
    if res.returncode != 0 or not res.stdout.strip():
        console.print("[bold red]Error:[/bold red] No Kubernetes contexts available. Please configure kubectl.")
        sys.exit(1)

    contexts = res.stdout.strip().split('\n')
    if cluster_name in contexts:
        console.print(f"[blue]Found exact context match:[/blue] {cluster_name}")
        return cluster_name

    partial_matches = [c for c in contexts if cluster_name in c]
    if partial_matches:
        console.print(f"[blue]Found partial context match:[/blue] {partial_matches[0]}")
        return partial_matches[0]

    answer = questionary.select(
        "Select the Kubernetes context to use:",
        choices=contexts
    ).ask()

    if not answer:
        console.print("[bold red]Error:[/bold red] No context selected. Aborting.")
        sys.exit(1)

    return answer

def generate_dest_namespace(app_type: str, app_name: str, cluster_name: str) -> str:
    if app_type == "infrastructure/kubernetes":
        return f"{app_name}-system"
    return app_name

def generate_app_namespace(cluster_name: str) -> str:
    return cluster_name.replace('.', '-')

def search_argocd_in_files(search_regex, file_pattern: str) -> str | None:
    # Use glob relative to PROJECT_ROOT
    files = list(PROJECT_ROOT.glob(file_pattern))
    for f in files:
        if not f.is_file():
            continue
        try:
            content = f.read_text(errors='ignore')
            hostnames_match = re.search(r'hostnames:\s*\n((\s+-\s+.*?\n)+)', content)
            if hostnames_match:
                block = hostnames_match.group(1)
                match = search_regex.search(block)
                if match:
                    return match.group(0)

            match = search_regex.search(content)
            if match:
                return match.group(0)
        except Exception:
            pass
    return None

def detect_argocd_server(cluster_name: str) -> str | None:
    pattern1 = f"projects/{cluster_name}/src/apps/*argocd/argocd.httproute.yaml"
    s = search_argocd_in_files(HOSTNAME_REGEX, pattern1)
    if s:
        return s

    pattern2 = f"projects/{cluster_name}/src/apps/*argocd/*ingress*.yaml"
    s = search_argocd_in_files(ARGOCD_REGEX, pattern2)
    if s:
        return s

    for p in PROJECT_ROOT.glob("projects/*/src/apps/*argocd/argocd.httproute.yaml"):
        rel_p = str(p.relative_to(PROJECT_ROOT))
        s = search_argocd_in_files(HOSTNAME_REGEX, rel_p)
        if s:
            return s

    import ssl
    ctx = ssl.create_default_context()

    for pat in COMMON_URL_PATTERNS:
        url = pat.format(cluster_name=cluster_name)
        hostname = url.replace("https://", "")
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=5, context=ctx):
                return hostname
        except Exception:
            pass

    return None

def handle_argocd_auth(cluster_name: str):
    console.print("[blue]Checking ArgoCD authentication...[/blue]")
    res = run_cmd([ARGOCD_CLI, "account", "get-user-info", "--grpc-web"], check=False)
    if res.returncode == 0 and "Logged In: true" in res.stdout:
        console.print("✅ [green]Already authenticated with ArgoCD[/green]")
        return

    argocd_env = os.environ.get("ARGOCD_SERVER")
    if argocd_env:
        console.print(f"[blue]Using environment server:[/blue] {argocd_env}")
        console.print("[blue]Authenticating with SSO...[/blue]")
        run_cmd([ARGOCD_CLI, "login", argocd_env, "--sso", "--grpc-web"], check=False, capture=False)
        return

    console.print("[blue]Auto-detecting ArgoCD server...[/blue]")
    argocd_server = "argocd.akn.chezmoi.sh"
    detected = detect_argocd_server(cluster_name)
    if detected:
        argocd_server = detected

    console.print(f"[blue]ArgoCD server detected:[/blue] {argocd_server}")
    console.print("[blue]Authenticating with SSO...[/blue]")
    run_cmd([ARGOCD_CLI, "login", argocd_server, "--sso", "--grpc-web"], check=False, capture=False)

def verify_cluster_exists(cluster_name: str) -> str:
    console.print(f"[blue]Verifying cluster '{cluster_name}' exists...[/blue]")
    res = run_cmd([ARGOCD_CLI, "cluster", "list", "-o", "wide", "--grpc-web"], check=False)
    if res.returncode != 0:
        console.print("[bold red]Error:[/bold red] Unable to list ArgoCD clusters. Check your authentication.")
        sys.exit(1)

    lines = res.stdout.strip().split('\n')
    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == cluster_name:
            console.print(f"✅ [green]Cluster '{cluster_name}' found in ArgoCD[/green]")
            return parts[0]

    console.print(f"[bold red]Error:[/bold red] Cluster '{cluster_name}' not found in ArgoCD.")
    sys.exit(1)

def check_app_exists(app_full_name: str) -> bool:
    console.print(f"[blue]Checking if application '{app_full_name}' exists...[/blue]")
    res = run_cmd([ARGOCD_CLI, "app", "get", app_full_name, "--grpc-web"], check=False)
    if res.returncode == 0:
        console.print(f"[blue]Application '{app_full_name}' already exists[/blue]")
        return True
    console.print(f"[blue]Application '{app_full_name}' does not exist, creation needed[/blue]")
    return False

def create_application(app_name: str, app_full_name: str, app_project: str, app_path: str, branch: str, cluster_server: str, dest_namespace: str):
    console.print(f"[blue]Creating application '{app_name}'...[/blue]")
    run_cmd([
        ARGOCD_CLI, "app", "create", app_full_name,
        "--repo", REPO_URL,
        "--path", app_path,
        "--dest-server", cluster_server,
        "--dest-namespace", dest_namespace,
        "--project", app_project,
        "--revision", branch,
        "--sync-policy", "automated",
        "--auto-prune",
        "--self-heal",
        "--sync-option", "CreateNamespace=true",
        "--sync-option", "ServerSideApply=true",
        "--grpc-web"
    ], capture=False)
    console.print(f"✅ [green]Application '{app_full_name}' created[/green]")

def update_application(app_full_name: str, branch: str):
    console.print(f"[blue]Updating application '{app_full_name}' to branch '{branch}'...[/blue]")
    res = run_cmd([ARGOCD_CLI, "app", "set", app_full_name, "--revision", branch, "--grpc-web"], check=False)
    if res.returncode != 0:
        console.print("[yellow]Application has multiple sources, updating first source...[/yellow]")
        run_cmd([ARGOCD_CLI, "app", "set", app_full_name, "--source-position", "1", "--revision", branch, "--grpc-web"], capture=False)
    console.print(f"✅ [green]Application '{app_full_name}' updated[/green]")

def sync_and_wait(app_full_name: str):
    console.print(f"[blue]Syncing application '{app_full_name}'...[/blue]")
    run_cmd([ARGOCD_CLI, "app", "sync", app_full_name, "--prune", "--force", "--grpc-web", "--output", "tree=detailed", "--preview-changes"], capture=False)
    console.print(f"✅ [green]Application '{app_full_name}' synced[/green]")

    console.print("[blue]Waiting for sync to complete...[/blue]")
    run_cmd([ARGOCD_CLI, "app", "wait", app_full_name, "--timeout", SYNC_TIMEOUT, "--grpc-web", "--output", "tree"], capture=False)
    console.print("✅ [green]Sync completed[/green]")

def show_application_info(app_full_name: str):
    console.print(f"[blue]Application information for {app_full_name}...[/blue]")
    res = run_cmd([ARGOCD_CLI, "app", "get", app_full_name, "--grpc-web"], check=False, capture=False)
    if res.returncode != 0:
        console.print(f"[bold red]Error:[/bold red] Application '{app_full_name}' does not exist in ArgoCD")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Synchronize an ArgoCD application automatically.")
    parser.add_argument("app_path", nargs="?", default=".", help="Path to the application directory")
    parser.add_argument("--reset", action="store_true", help="Reset application to main branch instead of current branch")
    parser.add_argument("--show", action="store_true", help="Show application information without making changes")
    args = parser.parse_args()

    if args.reset and args.show:
        console.print("[bold red]Error:[/bold red] Cannot use --reset and --show together.")
        sys.exit(1)

    check_dependencies("argocd", "git", "kubectl")
    check_git_repo()

    target_path = args.app_path

    try:
        if Path(normalize_path(target_path)).is_file():
            info = parse_yaml_path(target_path)
        else:
            info = parse_app_path(target_path)

        app_name = info["app_name"]
        app_type = info["app_type"]
        app_project = info["app_project"]
    except Exception as e:
        console.print(f"[bold red]Error parsing path:[/bold red] {e}")
        sys.exit(1)

    cluster_name = info["cluster_name"]
    app_path = info["app_path"]

    context = determine_context(cluster_name)
    dest_namespace = generate_dest_namespace(app_type, app_name, cluster_name)
    argocd_namespace = generate_app_namespace(cluster_name)
    app_full_name = f"{argocd_namespace}/{app_name}"

    if args.show:
        show_application_info(app_full_name)
        sys.exit(0)

    table = Table(title="Synchronization Summary", show_header=False)
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="magenta")
    table.add_row("App", f"{app_name} ({argocd_namespace})")
    table.add_row("Project", app_project)
    table.add_row("Source", app_path)
    table.add_row("Destination context", context)
    table.add_row("Destination namespace", dest_namespace)
    console.print(table)

    if not questionary.confirm(f"Sync ArgoCD application '{app_full_name}'?").ask():
        console.print("[yellow]Operation cancelled by user[/yellow]")
        sys.exit(0)

    branch = "main" if args.reset else get_current_branch()

    handle_argocd_auth(cluster_name)
    cluster_server = verify_cluster_exists(cluster_name)

    if check_app_exists(app_full_name):
        update_application(app_full_name, branch)
    else:
        run_cmd(["kubectl", "--context", context, "create", "namespace", dest_namespace], check=False, capture=True)
        create_application(app_name, app_full_name, app_project, app_path, branch, cluster_server, dest_namespace)

    sync_and_wait(app_full_name)
    console.print("🎉 [bold green]Synchronization completed successfully![/bold green]")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Operation cancelled by user.[/yellow]")
        sys.exit(1)
