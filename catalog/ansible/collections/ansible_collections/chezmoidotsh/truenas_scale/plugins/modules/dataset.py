#!/usr/bin/python
# -*- coding: utf-8 -*-

__metaclass__ = type

DOCUMENTATION = """
---
module: dataset
short_description: Manage ZFS filesystem datasets via TrueNAS middleware
description:
  - Create, update, and delete ZFS filesystem datasets on TrueNAS using the middleware API.
  - This module handles only FILESYSTEM type datasets. Use the zvol module for VOLUME type datasets.
  - Prevents sending null or invalid fields that cause errors.
options:
  name:
    description:
      - Full name (ZFS path) of the dataset, e.g. "pool/dataset".
    required: true
    type: str
  state:
    description:
      - If "present", ensure the dataset is created/updated.
      - If "absent", ensure the dataset is deleted.
    type: str
    choices: [ absent, present ]
    default: present
  create_ancestors:
    description:
      - If True, create any missing parent datasets automatically when creating.
      - Under TrueNAS CORE, this option is ignored. However, missing ancestors are not created.
    type: bool
    default: false
  comments:
    description:
      - Arbitrary comment or notes for the dataset.
    type: str
  sync:
    description:
      - Controls the behavior of synchronous requests.
    type: str
    choices: [ standard, always, disabled ]
  snapdev:
    description:
      - Controls whether snapshot devices are visible.
    type: str
    choices: [ hidden, visible ]
  compression:
    description:
      - Compression algorithm to use.
    type: str
    choices: [ off, lz4, gzip, gzip-1, gzip-2, gzip-3, gzip-4, gzip-5, gzip-6, gzip-7, gzip-8, gzip-9, zstd, zstd-fast, lzjb ]
  atime:
    description:
      - Controls whether access time is updated.
    type: str
    choices: [ on, off ]
  exec:
    description:
      - Controls whether processes can be executed from within this file system.
    type: str
    choices: [ on, off ]
  managedby:
    description:
      - Application that manages this dataset.
    type: str
  quota:
    description:
      - Quota for the dataset in bytes.
    type: int
  quota_warning:
    description:
      - Quota warning threshold as percentage.
    type: str
  quota_critical:
    description:
      - Quota critical threshold as percentage.
    type: str
  refquota:
    description:
      - Reference quota for the dataset in bytes.
    type: int
  refquota_warning:
    description:
      - Reference quota warning threshold as percentage.
    type: str
  refquota_critical:
    description:
      - Reference quota critical threshold as percentage.
    type: str
  reservation:
    description:
      - Reservation for the dataset in bytes.
    type: int
  refreservation:
    description:
      - Reference reservation for the dataset in bytes.
    type: int
  special_small_block_size:
    description:
      - Threshold block size for including small file blocks into the special allocation class.
    type: str
  copies:
    description:
      - Number of copies of data stored for this dataset.
    type: str
    choices: [ '1', '2', '3' ]
  snapdir:
    description:
      - Controls whether the .zfs directory is hidden or visible.
    type: str
    choices: [ hidden, visible ]
  deduplication:
    description:
      - Controls deduplication.
    type: str
    choices: [ on, off, verify, sha256, sha512, skein, edonr ]
  checksum:
    description:
      - Controls which checksum is used to verify data integrity.
    type: str
    choices: [ on, off, fletcher2, fletcher4, sha256, sha512, skein, edonr ]
  readonly:
    description:
      - Controls whether this dataset can be modified.
    type: str
    choices: [ on, off ]
  recordsize:
    description:
      - Specifies a suggested block size for files in the file system.
    type: str
    choices: [ 512, 1K, 2K, 4K, 8K, 16K, 32K, 64K, 128K, 256K, 512K, 1M, 16M ]
  aclmode:
    description:
      - Controls how ACL entries are modified during chmod operations.
    type: str
    choices: [ discard, groupmask, passthrough, restricted ]
  acltype:
    description:
      - Controls whether ACLs are enabled and what type.
    type: str
    choices: [ off, nfsv4, posix ]
  xattr:
    description:
      - Controls whether extended attributes are enabled.
    type: str
    choices: [ on, off, sa ]
  user_properties:
    description:
      - List of user-defined properties to set on the dataset.
    type: list
    elements: dict
    default: []
    suboptions:
      key:
        description: Property name
        type: str
        required: true
      value:
        description: Property value
        type: str
        required: true
  user_properties_update:
    description:
      - List of user-defined properties to update on the dataset.
    type: list
    elements: dict
    default: []
    suboptions:
      key:
        description: Property name
        type: str
        required: true
      value:
        description: Property value (required unless removing)
        type: str
      remove:
        description: Whether to remove this property
        type: bool
        default: false

author:
  - "Your Name (@yourhandle)"
"""

EXAMPLES = r"""
- name: Delete filesystem dataset if it exists
  dataset:
    name: test-pool/my-dataset
    state: absent

- name: Create filesystem dataset with compression
  dataset:
    name: test-pool/my-dataset
    compression: lz4
    quota: 107374182400  # 100GB
    comments: "My test filesystem dataset"

- name: Update dataset properties
  dataset:
    name: test-pool/existing-dataset
    readonly: off
    atime: off
    recordsize: "128K"
    user_properties:
      - key: "custom:purpose"
        value: "backup-storage"
"""

RETURN = r"""
dataset:
  description: Dataset properties as returned by the TrueNAS middleware.
  type: dict
  returned: on success
"""

from ansible.module_utils.basic import AnsibleModule
from ..module_utils.middleware import MiddleWare as MW
from ..module_utils import setup


# Valid recordsize values and their byte equivalents
RECORDSIZE_VALUES = {
    "512": 512,
    "1K": 1024,
    "2K": 2 * 1024,
    "4K": 4 * 1024,
    "8K": 8 * 1024,
    "16K": 16 * 1024,
    "32K": 32 * 1024,
    "64K": 64 * 1024,
    "128K": 128 * 1024,
    "256K": 256 * 1024,
    "512K": 512 * 1024,
    "1M": 1024 * 1024,
    "16M": 16 * 1024 * 1024,
}


def recordsize_to_bytes(value):
    """Convert recordsize display value to bytes."""
    if not value:
        return None
    return RECORDSIZE_VALUES.get(str(value).upper())


def bytes_to_recordsize(byte_value):
    """Convert bytes to recordsize display value."""
    if not byte_value:
        return None
    try:
        target_bytes = int(byte_value)
        for display, bytes_val in RECORDSIZE_VALUES.items():
            if bytes_val == target_bytes:
                return display
    except (ValueError, TypeError):
        pass
    return None


def compare_recordsize(desired_val, current_raw):
    """Compare desired recordsize with TrueNAS raw value."""
    if not desired_val and not current_raw:
        return True
    if not desired_val or not current_raw:
        return False
    
    # Direct string match (case insensitive)
    if str(desired_val).upper() == str(current_raw).upper():
        return True
    
    # Convert both to bytes and compare
    desired_bytes = recordsize_to_bytes(desired_val)
    try:
        current_bytes = int(current_raw)
        return desired_bytes == current_bytes
    except (ValueError, TypeError):
        pass
    
    return False


def main():

    argument_spec = dict(
        name=dict(type="str", required=True),
        state=dict(type="str", choices=["absent", "present"], default="present"),
        create_ancestors=dict(type="bool", default=False),
        comments=dict(type="str"),
        sync=dict(type="str", choices=["standard", "always", "disabled"]),
        snapdev=dict(type="str", choices=["hidden", "visible"]),
        compression=dict(type="str", choices=[
            "off", "lz4", "gzip", "gzip-1", "gzip-2", "gzip-3", "gzip-4", 
            "gzip-5", "gzip-6", "gzip-7", "gzip-8", "gzip-9", "zstd", 
            "zstd-fast", "lzjb"
        ]),
        atime=dict(type="str", choices=["on", "off"]),
        exec=dict(type="str", choices=["on", "off"]),
        managedby=dict(type="str"),
        quota=dict(type="int"),
        quota_warning=dict(type="str"),
        quota_critical=dict(type="str"),
        refquota=dict(type="int"),
        refquota_warning=dict(type="str"),
        refquota_critical=dict(type="str"),
        reservation=dict(type="int"),
        refreservation=dict(type="int"),
        special_small_block_size=dict(type="str"),
        copies=dict(type="str", choices=["1", "2", "3"]),
        snapdir=dict(type="str", choices=["hidden", "visible"]),
        deduplication=dict(type="str", choices=[
            "on", "off", "verify", "sha256", "sha512", "skein", "edonr"
        ]),
        checksum=dict(type="str", choices=[
            "on", "off", "fletcher2", "fletcher4", "sha256", "sha512", "skein", "edonr"
        ]),
        readonly=dict(type="str", choices=["on", "off"]),
        recordsize=dict(type="str", choices=list(RECORDSIZE_VALUES.keys())),
        aclmode=dict(type="str", choices=["discard", "groupmask", "passthrough", "restricted"]),
        acltype=dict(type="str", choices=["off", "nfsv4", "posix"]),
        xattr=dict(type="str", choices=["on", "off", "sa"]),
        user_properties=dict(
            type="list",
            elements="dict",
            default=[],
            options=dict(
                key=dict(type="str", required=True),
                value=dict(type="str", required=True),
            ),
        ),
        user_properties_update=dict(
            type="list",
            elements="dict",
            default=[],
            options=dict(
                key=dict(type="str", required=True),
                value=dict(type="str"),
                remove=dict(type="bool"),
            ),
        ),
    )

    module = AnsibleModule(
        argument_spec=argument_spec,
        supports_check_mode=True,
    )

    # Validate TrueNAS Scale environment
    __tn_version = setup.validate_truenas_scale(module)

    result = dict(changed=False, filesystem={}, msg="")
    mw = MW.client()

    p = module.params
    ds_name = p["name"]
    state = p["state"]

    # Query if it exists
    try:
        existing = mw.call("pool.dataset.query", [["name", "=", ds_name]])
    except Exception as e:
        module.fail_json(msg=f"Failed to query dataset '{ds_name}': {e}")

    if existing:
        existing_ds = existing[0]
    else:
        existing_ds = None

    if state == "absent":
        # If not found, no changes
        if not existing_ds:
            module.exit_json(
                changed=False, msg=f"Dataset '{ds_name}' is already absent."
            )
        # else delete it
        if module.check_mode:
            module.exit_json(changed=True, msg=f"Would delete dataset '{ds_name}'.")
        try:
            mw.call("pool.dataset.delete", ds_name, {"recursive": True})
            module.exit_json(changed=True, msg=f"Deleted dataset '{ds_name}'.")
        except Exception as e:
            module.fail_json(msg=f"Error deleting dataset '{ds_name}': {e}")
    else:
        # state == 'present'
        if not existing_ds:
            # Need to create
            create_args = build_create_args(p, module, __tn_version)
            if module.check_mode:
                module.exit_json(
                    changed=True,
                    msg=f"Would create dataset '{ds_name}' with args={create_args}",
                )
            try:
                new_ds = mw.call("pool.dataset.create", create_args)
                result["changed"] = True
                result["filesystem"] = new_ds
                result["msg"] = f"Created dataset '{ds_name}'."
                module.exit_json(**result)
            except Exception as e:
                module.fail_json(msg=f"Error creating dataset '{ds_name}': {e}")
        else:
            # Possibly update
            update_args = build_update_args(p, existing_ds, module)
            if not update_args:
                module.exit_json(
                    changed=False,
                    msg=f"Dataset '{ds_name}' is up to date.",
                    filesystem=existing_ds,
                )
            else:
                if module.check_mode:
                    module.exit_json(
                        changed=True,
                        msg=f"Would update dataset '{ds_name}' with {update_args}",
                    )
                try:
                    updated_ds = mw.call("pool.dataset.update", ds_name, update_args)
                    result["changed"] = True
                    result["filesystem"] = updated_ds
                    result["msg"] = f"Updated dataset '{ds_name}'."
                    module.exit_json(**result)
                except Exception as e:
                    module.fail_json(msg=f"Error updating dataset '{ds_name}': {e}")


def build_create_args(params, module, tn_version):
    # Always create FILESYSTEM type datasets
    create_args = dict(name=params["name"], type="FILESYSTEM")

    if params.get("create_ancestors") is not None:
        if tn_version['type'] == "CORE":
            # TrueNAS CORE doesn't support create_ancestors.
            module.warn("TrueNAS CORE doesn't support create_ancestors option.")
        else:
            create_args["create_ancestors"] = params["create_ancestors"]

    # All filesystem properties are optional
    create_props = [
        "comments",
        "sync",
        "snapdev",
        "compression",
        "atime",
        "exec",
        "managedby",
        "quota",
        "quota_warning",
        "quota_critical",
        "refquota",
        "refquota_warning",
        "refquota_critical",
        "reservation",
        "refreservation",
        "special_small_block_size",
        "copies",
        "snapdir",
        "deduplication",
        "checksum",
        "readonly",
        "recordsize",
        "aclmode",
        "acltype",
        "xattr",
    ]
    for prop in create_props:
        val = params.get(prop)
        if val is not None:
            create_args[prop] = val

    # user_properties
    if params.get("user_properties"):
        create_args["user_properties"] = params["user_properties"]

    return create_args


def build_update_args(params, existing_ds, module):
    update_args = {}
    ds_type = existing_ds["type"]  # Should be "FILESYSTEM" only

    # Ensure we're only working with filesystem datasets
    if ds_type != "FILESYSTEM":
        module.fail_json(
            msg=f"This module only handles FILESYSTEM datasets. Found type: {ds_type}. Use the zvol module for VOLUME datasets."
        )

    # For filesystem properties
    updatable_props = [
        "comments",
        "sync",
        "snapdev",
        "compression",
        "atime",
        "exec",
        "managedby",
        "quota",
        "quota_warning",
        "quota_critical",
        "refquota",
        "refquota_warning",
        "refquota_critical",
        "reservation",
        "refreservation",
        "special_small_block_size",
        "copies",
        "snapdir",
        "deduplication",
        "checksum",
        "readonly",
        "recordsize",
        "aclmode",
        "acltype",
        "xattr",
    ]
    for prop in updatable_props:
        if params.get(prop) is None:
            continue
        desired_val = params[prop]
        current_val = prop_rawvalue(existing_ds, prop)
        if not compare_prop(prop, desired_val, current_val):
            update_args[prop] = desired_val

    # user_properties (bulk set)
    if params.get("user_properties"):
        if params["user_properties"]:
            update_args["user_properties"] = params["user_properties"]

    # user_properties_update
    if params.get("user_properties_update"):
        ups = []
        for item in params["user_properties_update"]:
            up = {"key": item["key"]}
            if item.get("remove"):
                up["remove"] = True
            elif item.get("value") is not None:
                up["value"] = item["value"]
            ups.append(up)
        if ups:
            update_args["user_properties_update"] = ups

    return update_args


def prop_rawvalue(dataset_entry, prop_name):
    """
    Retrieve the 'rawvalue' from dataset_entry[prop_name].
    Return string or None if missing. We also strip() whitespace for safety.
    """
    if prop_name in dataset_entry:
        d = dataset_entry[prop_name]
        if isinstance(d, dict):
            rv = d.get("rawvalue")
            if rv is not None:
                return rv.strip()
    return None


def compare_prop(prop_name, desired_val, current_str):
    """
    Compare desired_val (from user) vs. current_str (from dataset's rawvalue)
    in a way that avoids spurious changes (case, etc.).
    Return True if effectively the same, False if different.
    """
    if current_str is None and desired_val is None:
        return True
    
    # Special handling for recordsize
    if prop_name == "recordsize":
        return compare_recordsize(desired_val, current_str)
    
    desired_str = str(desired_val).strip()
    if current_str is None:
        current_str = ""

    # known enumerations for case-insensitive compare
    lower_enums = {
        "on",
        "off",
        "inherit",
        "standard",
        "always",
        "disabled",
        "visible",
        "hidden",
        "lz4",
        "zstd",
        "nfsv4",
        "posix",
        "restricted",
        "passthrough",
        "discard",
        "verify",
    }
    if desired_str.lower() in lower_enums or current_str.lower() in lower_enums:
        return desired_str.lower() == current_str.lower()

    # otherwise direct string compare
    return desired_str == current_str


if __name__ == "__main__":
    main()
