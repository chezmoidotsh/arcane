import os
import glob
import re

ansible_dir = "/Volumes/Space/Personnel/github.com/chezmoidotsh/arcane/projects/shodan.akn/ansible"

# 1. Fix tasks/main.yml
task_files = glob.glob(f"{ansible_dir}/roles/*/tasks/main.yml")
for f in task_files:
    with open(f, 'r') as fp:
        content = fp.read()
    
    # Replace LaunchDaemon with LaunchAgent in task comments/names
    content = content.replace("LaunchDaemon", "LaunchAgent")
    
    # Remove become: true and owner/group
    content = re.sub(r'\s*become:\s*true\n', '\n', content)
    content = re.sub(r'\s*owner:\s*root\n', '\n', content)
    content = re.sub(r'\s*group:\s*wheel\n', '\n', content)
    
    # Replace template destination
    content = content.replace('/Library/LaunchDaemons/', "{{ lookup('env', 'HOME') }}/Library/LaunchAgents/")
    
    # Replace launchctl bootstrap system with gui/UID
    content = content.replace('launchctl bootstrap system ', "launchctl bootstrap gui/{{ lookup('pipe', 'id -u') }} ")
    
    # Add Ensure LaunchAgents directory exists if not already there
    if "Ensure User LaunchAgents directory exists" not in content and "LaunchAgent" in content:
        ensure_dir = """
- name: Ensure User LaunchAgents directory exists
  ansible.builtin.file:
    path: "{{ lookup('env', 'HOME') }}/Library/LaunchAgents"
    state: directory
    mode: "0755"
"""
        # Insert before the Template LaunchAgent task
        content = re.sub(r'(\n- name: Template .* LaunchAgent)', ensure_dir + r'\1', content)
        
    with open(f, 'w') as fp:
        fp.write(content)

# 2. Fix handlers/main.yml
handler_files = glob.glob(f"{ansible_dir}/roles/*/handlers/main.yml")
for f in handler_files:
    with open(f, 'r') as fp:
        content = fp.read()
    
    content = re.sub(r'\s*become:\s*true\n', '\n', content)
    content = content.replace('system/sh.chezmoi', "gui/{{ lookup('pipe', 'id -u') }}/sh.chezmoi")
    
    with open(f, 'w') as fp:
        fp.write(content)

# 3. Fix plists (remove UserName)
plist_files = glob.glob(f"{ansible_dir}/roles/*/templates/*.plist.j2")
for f in plist_files:
    with open(f, 'r') as fp:
        content = fp.read()
    
    content = re.sub(r'\s*<key>UserName</key>\s*<string>\{\{\s*lookup\([^}]+\)\s*\}\}</string>', '', content)
    
    with open(f, 'w') as fp:
        fp.write(content)

# 4. Fix README.md
readme = f"{ansible_dir}/README.md"
with open(readme, 'r') as fp:
    content = fp.read()

content = content.replace("sudo launchctl kickstart", "launchctl kickstart")
content = content.replace("system/", "gui/$(id -u)/")
content = content.replace("requires only for Caddy installation in `/usr/local/bin` and loading LaunchDaemons into `/Library/LaunchDaemons`", "used for nothing anymore, Ansible runs in purely unprivileged mode (user space)")
content = content.replace("sudo password, which is required only", "sudo password, which is no longer needed.")

with open(readme, 'w') as fp:
    fp.write(content)

print("Fixes applied successfully.")
