# Ansible Role: ansible-run-notification-on-slack

Send Slack notifications at playbook start and completion with execution summary.

## Table of Contents

* [Overview](#overview)
* [Features](#features)
* [Requirements](#requirements)
* [Role Variables](#role-variables)
  * [Required Variables](#required-variables)
  * [Slack Configuration](#slack-configuration)
  * [ARA Integration](#ara-integration)
  * [Notification Behavior](#notification-behavior)
  * [Message Customization](#message-customization)
  * [Internal Variables](#internal-variables)
* [Dependencies](#dependencies)
* [Example Playbook](#example-playbook)
* [Advanced Usage](#advanced-usage)
* [License](#license)

## Overview

This role provides a standardized way to send Slack notifications during Ansible playbook execution. It sends a notification when the playbook starts and updates it (or sends a new one) when the playbook completes, with execution summary including:

* Execution status (success/failure)
* Execution duration
* Start and finish timestamps
* Optional link to ARA web interface via hostname

## Features

* **Start notification**: Sends a notification when playbook execution begins
* **Rescue notification**: Automatically captures and reports playbook failures with detailed error context
* **Completion notification**: Updates or sends new notification with execution results
* **ARA link**: Optional hostname link to ARA web interface for detailed run reports
* **Customizable**: Extensive configuration options for behavior and appearance
* **Error handling**: Configurable error tolerance to prevent notification failures from stopping playbooks
* **Slack Block Kit**: Rich formatted messages with emoji, fields, and context

## Requirements

* Ansible 2.9 or higher
* `community.general` collection (for `slack` module)
* Slack Bot Token with appropriate permissions (`chat:write`, `chat:write.customize`)

## Role Variables

### Required Variables

```yaml
# Slack bot token (should be stored in Ansible Vault)
arnos_slack_token: "xoxb-your-slack-bot-token"
```

### Slack Configuration

```yaml
# Target Slack channel for notifications
# Format: "#channel-name" or "@username"
arnos_slack_channel: "#notifications"

# Bot username displayed in Slack
arnos_slack_username: "Ansible"

# Enable/disable Slack notifications
arnos_enabled: true
```

### ARA Integration

```yaml
# Public URL for ARA web interface (used as hostname link in Slack)
# Leave empty to display plain hostname without link
# Example: "https://ara.example.com"
arnos_ara_public_url: ""
```

### Notification Behavior

```yaml
# Send start notification (beginning of playbook)
arnos_send_start: true

# Send rescue notification (on playbook failure)
arnos_send_rescue: true

# Send completion notification (end of playbook)
arnos_send_completion: true

# Update start message with completion/failure status
# If false, sends new completion/failure message instead
arnos_update_start_message: true

# Ignore errors when sending notifications
# Prevents notification failures from failing the playbook
arnos_ignore_errors: true
```

### Message Customization

```yaml
# Custom emoji for different statuses
arnos_success_emoji: ":white_check_mark:"
arnos_failure_emoji: ":x:"
arnos_running_emoji: ":rocket:"
```

### Internal Variables

These variables are managed internally by the role. Override only if you understand the implications:

```yaml
# Fact names for storing execution context
arnos_start_epoch_fact: "playbook_start_epoch"
arnos_start_iso_fact: "playbook_start_iso"
arnos_message_ts_fact: "slack_message_ts"
arnos_message_channel_fact: "slack_message_channel"
arnos_enabled_fact: "slack_notifications_enabled"
```

## Dependencies

* `community.general` collection

Install with:

```bash
ansible-galaxy collection install community.general
```

## Example Playbook

### Basic Usage

```yaml
---
- name: Example Playbook with Slack Notifications
  hosts: all
  tasks:
    - name: Send start notification
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: start
        arnos_slack_token: !vault |
          $ANSIBLE_VAULT;1.1;AES256
          ...
      delegate_to: localhost
      run_once: true

    - block:
        # Your playbook tasks here
        - name: Example task
          ansible.builtin.debug:
            msg: "Doing important work"

      rescue:
        - name: Send failure notification
          ansible.builtin.include_role:
            name: ansible-run-notification-on-slack
          vars:
            notification_phase: rescue
          delegate_to: localhost
          run_once: true

      always:
        - name: Send completion notification
          ansible.builtin.include_role:
            name: ansible-run-notification-on-slack
          vars:
            notification_phase: completion
          delegate_to: localhost
          run_once: true
```

### With ARA Link

```yaml
---
- name: Playbook with ARA-linked Slack Notifications
  hosts: all
  vars:
    arnos_slack_token: !vault |
      $ANSIBLE_VAULT;1.1;AES256
      ...
    arnos_ara_public_url: "https://ara.example.com"
    arnos_slack_channel: "#ansible-production"
    arnos_slack_username: "Ansible (Production)"

  tasks:
    - name: Notify playbook start
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: start
      delegate_to: localhost
      run_once: true

    # Your infrastructure tasks
    - name: Deploy application
      ansible.builtin.include_tasks: deploy.yml

    - name: Notify playbook completion
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: completion
      delegate_to: localhost
      run_once: true
```

### Minimal Configuration

```yaml
---
- name: Simple Playbook with Basic Notifications
  hosts: localhost
  vars:
    arnos_slack_token: "{{ lookup('env', 'SLACK_BOT_TOKEN') }}"

  tasks:
    - name: Start notification
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: start

    - name: Do work
      ansible.builtin.shell: echo "Working..."

    - name: Completion notification
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: completion
```

## Advanced Usage

### Custom Emoji Per Environment

```yaml
---
- name: Production Deployment
  hosts: production
  vars:
    arnos_slack_token: !vault |
      ...
    arnos_running_emoji: ":construction:"
    arnos_success_emoji: ":tada:"
    arnos_failure_emoji: ":fire:"
    arnos_slack_username: "Ansible (PRODUCTION)"
    arnos_slack_channel: "#prod-alerts"
```

### Separate Channels for Start and Completion

```yaml
---
- name: Multi-channel Notification
  hosts: all
  tasks:
    - name: Start notification to monitoring channel
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: start
        arnos_slack_channel: "#monitoring"
        arnos_update_start_message: false
      delegate_to: localhost
      run_once: true

    # Tasks...

    - name: Completion notification to operations channel
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: completion
        arnos_slack_channel: "#operations"
      delegate_to: localhost
      run_once: true
```

### Disable Notifications for Non-Critical Runs

```yaml
---
- name: Development Playbook
  hosts: dev
  vars:
    arnos_enabled: "{{ lookup('env', 'ENABLE_SLACK_NOTIFICATIONS') | default('false') | bool }}"
  tasks:
    - name: Start notification (only if enabled)
      ansible.builtin.include_role:
        name: ansible-run-notification-on-slack
      vars:
        notification_phase: start
      when: arnos_enabled
      delegate_to: localhost
      run_once: true
```

## Notification Message Format

### Start Notification

```text
🚀 Ansible Starting

Status: In progress
Started: 2025-11-16T10:30:00Z UTC

Host: hostname (or linked to ARA if configured)
```

### Completion Notification (Success)

```text
✅ Ansible Success

Status: Success                  Duration: 00:05:23

Host: hostname (or linked to ARA if configured)
Started: 2025-11-16T10:30:00Z UTC
Finished: 2025-11-16T10:35:23Z UTC
```

### Rescue Notification (Playbook Failure)

```text
❌ Ansible Failed

Status: Failed                   Duration: 00:03:45
Failed Task: [Step 2] Setup GitOps automation
Error: Unable to locate package ansible

Host: hostname (or linked to ARA if configured)
Started: 2025-11-16T10:30:00Z UTC
Failed: 2025-11-16T10:33:45Z UTC
```

## Troubleshooting

### Notifications Not Sending

1. **Verify Slack token**: Ensure `arnos_slack_token` is correctly set and not empty
2. **Check channel permissions**: Bot must be invited to the target channel
3. **Review error messages**: Set `arnos_ignore_errors: false` to see errors
4. **Test Slack module**: Use `ansible-doc community.general.slack` for module documentation

### Start Message Not Updated

1. **Verify message\_ts**: Check that start notification succeeded and `slack_message_ts` fact was set
2. **Enable new messages**: Set `arnos_update_start_message: false` to always send new completion message
3. **Check token permissions**: Ensure bot has `chat:write` permission for updating messages

## License

MIT

## Author Information

Created by Alexandre Nicolaie for the Arcane homelab infrastructure project.

For issues, questions, or contributions, visit: <https://github.com/chezmoidotsh/arcane>
