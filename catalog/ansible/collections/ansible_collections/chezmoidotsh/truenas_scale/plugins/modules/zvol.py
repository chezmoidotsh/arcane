#!/usr/bin/python
# -*- coding: utf-8 -*-

# XXX - Would be nice to specify 'volsize' in units other than bytes:
# accept suffixes: K, KB, KiB, M, MB, MiB, G, GB, GiB, T, TB, TiB.

__metaclass__ = type

DOCUMENTATION = """
---
module: zvol
short_description: Manage ZFS volumes (zvols) via TrueNAS middleware
description:
  - Create, update, and delete ZFS volumes (zvols) on TrueNAS using the middleware API.
  - Handles only VOLUME type datasets - use the 'dataset' module for FILESYSTEM datasets.
  - Prevents sending null or invalid fields that cause errors.
  - Normalizes property values so that e.g. '64K' is treated the same as '65536'
    for volblocksize comparisons. If a user tries to change volblocksize or sparse
    on an existing volume, the module raises an error (since TrueNAS disallows it).
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
  type:
    description:
      - "Dataset type - fixed to VOLUME for zvol module."
    type: str
    choices:
      - VOLUME
      - volume
    default: VOLUME
  volsize:
    description:
      - Size of the volume (required for zvol creation).
      - This can be either an integer, or a string like '640K', '32MB', '10GiB', or '1TB'.
      - |-
        Allowable  suffixes are:
        "K", "M", "G", "T" (powers of 2),
        "KB", "MB", "GB", "TB" (powers of 10),
        "KiB", "MiB", "GiB", "TiB" (powers of 2)
      - This is required when creating a volume, but not when updating an existing one.
    type: str
  volblocksize:
    description:
      - Volume block size for the zvol, e.g. "64K" or "65536".
      - Only valid at volume creation time; cannot be changed on an existing volume.
    type: str
    choices: [ '512','512B','1K','2K','4K','8K','16K','32K','64K','128K', '256K', '65536' ]
    default: '64K'
  sparse:
    description:
      - Whether to create a sparse volume.
      - Cannot be changed after creation.
    type: bool
    default: false
  force_size:
    description:
      - Whether to ignore checks if the volume size is below thresholds.
    type: bool
    default: false
  create_ancestors:
    description:
      - If True, create any missing parent datasets automatically when creating.
      - Under TrueNAS CORE, this option is ignored. However, missing ancestors are not created.
    type: bool
    default: false
  comment:
    description:
      - Arbitrary comment or notes for the volume.
    type: str
  sync:
    description:
      - Sync property for the volume.
    type: str
    choices: [ standard, always, disabled ]
  compression:
    description:
      - Compression algorithm for the volume.
    type: str
    choices: [ inherit, lz4, zstd, gzip, zstd-fast, lz4hc, gzip-1, gzip-2, gzip-3, gzip-4, gzip-5, gzip-6, gzip-7, gzip-8, gzip-9 ]
  deduplication:
    description:
      - Deduplication setting for the volume.
    type: str
    choices: [ inherit, "on", "off", verify, sha256 ]
  checksum:
    description:
      - Checksum algorithm for the volume.
    type: str
    choices: [ inherit, "on", "off", fletcher2, fletcher4, sha256, sha512, skein ]
  readonly:
    description:
      - Whether the volume should be read-only.
    type: str
    choices: [ "on", "off", inherit ]
  copies:
    description:
      - Number of copies of data to maintain.
    type: str
    choices: [ "1", "2", "3" ]
  reservation:
    description:
      - Guaranteed space reservation for the volume in bytes.
    type: int
  refreservation:
    description:
      - Referenced data reservation for the volume in bytes.
    type: int
  user_properties:
    description:
      - List of custom user properties to set on the volume.
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
      - List of user property updates (add/modify/remove).
    type: list
    elements: dict
    default: []
    suboptions:
      key:
        description: Property name
        type: str
        required: true
      value:
        description: Property value (omit when removing)
        type: str
      remove:
        description: Whether to remove this property
        type: bool

author:
  - "Your Name (@yourhandle)"
"""

EXAMPLES = r"""
- name: Create a basic zvol
  zvol:
    name: tank/my-volume
    volsize: 10GiB
    state: present

- name: Create zvol with custom block size and sparse allocation
  zvol:
    name: tank/vm-disk
    volsize: 50GB
    volblocksize: "32K"
    sparse: true
    compression: lz4

- name: Create zvol with reservation and custom properties
  zvol:
    name: tank/database-vol
    volsize: 100GB
    reservation: 107374182400  # 100GB in bytes
    sync: always
    user_properties:
      - key: "custom:purpose"
        value: "database"
      - key: "custom:backup"
        value: "daily"

- name: Update zvol size
  zvol:
    name: tank/my-volume
    volsize: 20GiB

- name: Delete zvol if it exists
  zvol:
    name: tank/old-volume
    state: absent
"""

RETURN = r"""
zvol:
  description: Volume properties as returned by the TrueNAS middleware.
  type: dict
  returned: on success
  sample:
    id: tank/my-volume
    type: VOLUME
    name: tank/my-volume
    pool: tank
    encrypted: false
    mountpoint: /dev/zvol/tank/my-volume
    volsize:
      rawvalue: "10737418240"
      parsed: 10737418240
    volblocksize:
      rawvalue: "65536"
      parsed: 65536
    sparse:
      rawvalue: "off"
      parsed: false
"""

import re
from ansible.module_utils.basic import AnsibleModule
from ..module_utils.middleware import MiddleWare as MW
from ..module_utils import setup


def main():

    argument_spec = dict(
        name=dict(type="str", required=True),
        state=dict(type="str", choices=["absent", "present"], default="present"),
        type=dict(type="str",
                  choices=["VOLUME", "volume"],
                  default="VOLUME"),
        volsize=dict(type="str"),
        volblocksize=dict(
            type="str",
            choices=[
                "512",
                "512B",
                "1K",
                "2K",
                "4K",
                "8K",
                "16K",
                "32K",
                "64K",
                "128K",
                "256K",
                "65536",  # numeric form
            ],
            default="64K"
        ),
        sparse=dict(type="bool", default=False),
        force_size=dict(type="bool", default=False),
        create_ancestors=dict(type="bool", default=False),
        # Volume-relevant properties only
        comment=dict(type="str"),
        sync=dict(type="str", choices=["standard", "always", "disabled"]),
        compression=dict(type="str", choices=["inherit", "lz4", "zstd", "gzip", "zstd-fast", "lz4hc", "gzip-1", "gzip-2", "gzip-3", "gzip-4", "gzip-5", "gzip-6", "gzip-7", "gzip-8", "gzip-9"]),
        deduplication=dict(type="str", choices=["inherit", "on", "off", "verify", "sha256"]),
        checksum=dict(type="str", choices=["inherit", "on", "off", "fletcher2", "fletcher4", "sha256", "sha512", "skein"]),
        readonly=dict(type="str", choices=["on", "off", "inherit"]),
        copies=dict(type="str", choices=["1", "2", "3"]),
        reservation=dict(type="int"),
        refreservation=dict(type="int"),
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

    result = dict(changed=False, zvol={}, msg="")
    mw = MW.client()

    p = module.params
    ds_name = p["name"]
    state = p["state"]

    # Some of the arguments are synonyms. Normalize to a canonical
    # value.
    # This seems like the sort of thing that Ansible argument_spec
    # would support, but apparently it doesn't.
    if 'type' in module.params:
        if module.params['type'] in ["volume"]:
            module.params['type'] = module.params['type'].upper()
    
    # Ensure we're only dealing with volumes
    if module.params['type'] not in ["VOLUME"]:
        module.fail_json(msg=f"Invalid type '{module.params['type']}'. This module only handles VOLUME datasets.")

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
                changed=False, msg=f"Volume '{ds_name}' is already absent."
            )
        # else delete it
        if module.check_mode:
            module.exit_json(changed=True, msg=f"Would delete volume '{ds_name}'.")
        try:
            mw.call("pool.dataset.delete", ds_name, {"recursive": True})
            module.exit_json(changed=True, msg=f"Deleted volume '{ds_name}'.")
        except Exception as e:
            module.fail_json(msg=f"Error deleting volume '{ds_name}': {e}")
    else:
        # state == 'present'
        if not existing_ds:
            # Need to create - validate volsize is provided
            if not p.get("volsize"):
                module.fail_json(msg="volsize is required when creating a volume.")
            create_args = build_create_args(p, module, __tn_version)
            if module.check_mode:
                module.exit_json(
                    changed=True,
                    msg=f"Would create volume '{ds_name}' with args={create_args}",
                )
            try:
                new_ds = mw.call("pool.dataset.create", create_args)
                result["changed"] = True
                result["zvol"] = new_ds
                result["msg"] = f"Created volume '{ds_name}'."
                module.exit_json(**result)
            except Exception as e:
                module.fail_json(msg=f"Error creating volume '{ds_name}': {e}")
        else:
            # Possibly update
            # Verify existing dataset is a volume
            if existing_ds.get("type") != "VOLUME":
                module.fail_json(msg=f"Dataset '{ds_name}' exists but is not a volume. Use the 'dataset' module for FILESYSTEM datasets.")
            
            update_args = build_update_args(p, existing_ds, module)
            if not update_args:
                module.exit_json(
                    changed=False,
                    msg=f"Volume '{ds_name}' is up to date.",
                    zvol=existing_ds,
                )
            else:
                if module.check_mode:
                    module.exit_json(
                        changed=True,
                        msg=f"Would update volume '{ds_name}' with {update_args}",
                    )
                try:
                    updated_ds = mw.call("pool.dataset.update", ds_name, update_args)
                    result["changed"] = True
                    result["zvol"] = updated_ds
                    result["msg"] = f"Updated volume '{ds_name}'."
                    module.exit_json(**result)
                except Exception as e:
                    module.fail_json(msg=f"Error updating volume '{ds_name}': {e}")


def build_create_args(params, module, tn_version):
    create_args = dict(name=params["name"], type=params["type"])

    if params.get("create_ancestors") is not None:
        if tn_version['type'] == "CORE":
            # TrueNAS CORE doesn't support create_ancestors.
            module.warn("TrueNAS CORE doesn't support create_ancestors option.")
        else:
            create_args["create_ancestors"] = params["create_ancestors"]

    # Volume-specific parameters
    volsize = params.get("volsize")
    if not volsize:
        module.fail_json(msg="volsize is required when creating a volume.")
    create_args["volsize"] = parse_volsize(volsize)

    if params.get("volblocksize") is not None:
        create_args["volblocksize"] = params["volblocksize"]

    if params.get("sparse") is not None:
        create_args["sparse"] = params["sparse"]

    if params.get("force_size") is not None:
        create_args["force_size"] = params["force_size"]

    # Volume-relevant properties only
    create_props = [
        "comment",
        "sync",
        "compression",
        "deduplication",
        "checksum",
        "readonly",
        "copies",
        "reservation",
        "refreservation",
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
    ds_type = existing_ds["type"]  # Should be "VOLUME" for this module
    
    # Verify we're working with a volume
    if ds_type != "VOLUME":
        module.fail_json(msg=f"Dataset is not a volume (type={ds_type}). Use the 'dataset' module for FILESYSTEM datasets.")

    # Volume size updates
    if params.get("volsize") is not None:
        current_volsize = prop_rawvalue(existing_ds, "volsize") or ""
        desired_str = str(parse_volsize(params["volsize"]))
        if desired_str != current_volsize:
            update_args["volsize"] = params["volsize"]

    # If user tries to update volblocksize => check if it differs
    # If differs => error. If same => skip
    if params.get("volblocksize") is not None:
        user_vbs = parse_volblocksize(params["volblocksize"])  # convert to int
        curr_raw = prop_rawvalue(existing_ds, "volblocksize") or ""
        try:
            curr_vbs = parse_volblocksize(curr_raw)
        except Exception:
            curr_vbs = None
        if curr_vbs != user_vbs:
            module.fail_json(
                msg=(
                    f"Cannot update 'volblocksize' on existing volume. "
                    f"Current={curr_raw} => {curr_vbs} vs. desired={params['volblocksize']} => {user_vbs}."
                )
            )

    # If user tries to update sparse => check if it differs
    # If differs => error, if same => skip
    if params.get("sparse") is not None:
        module.warn(
            "Cannot update 'sparse' on existing volume, ignoring parameter."
        )

    # force_size can be used if resizing
    if params.get("force_size") is not None and params.get("force_size"):
        update_args["force_size"] = True

    # Volume-relevant updatable properties only
    updatable_props = [
        "comment",
        "sync", 
        "compression",
        "deduplication",
        "checksum",
        "readonly",
        "copies",
        "reservation",
        "refreservation",
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


def parse_volblocksize(value):
    """
    Convert a string like '64K' or '512B' or a numeric string like '65536'
    into an integer number of bytes. Raise an exception if unknown.
    """
    mapping = {
        "512": 512,
        "512B": 512,
        "1K": 1024,
        "2K": 2048,
        "4K": 4096,
        "8K": 8192,
        "16K": 16384,
        "32K": 32768,
        "64K": 65536,
        "128K": 131072,
        "256K": 262144,  # in case user sets that
    }
    val = value.strip().upper()  # e.g. '64K' or '65536'
    if val in mapping:
        return mapping[val]
    # else maybe it's purely numeric, e.g. '65536'
    if val.isdigit():
        return int(val)
    raise ValueError(f"Cannot parse volblocksize='{value}'")

def parse_volsize(value):
    """
    Convert a string giving a volume size, like '25GB', into an
    integer number of bytes. Plain integers are also acceptable.

    Acceptable suffixes are:
    "K", "M", "G", "T" (powers of 2),
    "KB", "MB", "GB", "TB" (powers of 10),
    "KiB", "MiB", "GiB", "TiB" (powers of 2)
    """

    # Split the value into an integer prefix and a suffix.
    match = re.match('^\s*(\d+)\s*([KMGT]i?B?)?\s*$', value)

    # the volume size is supposed to be a multiplier of the block
    # size, which in turn is usually a power of 2. So if the caller
    # just specifies K, M, G, or T, we'll use powers of 2.
    unit_multiplier = {
        "":       1,
        "K":   1<<10,
        "KB":  1000,
        "KiB": 1<<10,
        "M":   1<<20,
        "MB":  1000**2,
        "MiB": 1<<20,
        "G":   1<<30,
        "GB":  1000**3,
        "GiB": 1<<30,
        "T":   1<<40,
        "TB":  1000**4,
        "TiB": 1<<40,
    }

    if match:
        n = int(match[1])
        unit = match[2]
        return n * unit_multiplier[unit]
    else:
        raise ValueError(f"Can't parse volsize={value}")

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


def same_value_bool(desired_bool, current_str):
    """
    For fields like 'sparse' (bool), compare with current_str which might be "ON","OFF","TRUE","FALSE", etc.
    Return True if they match, False otherwise.
    """
    d_str = "on" if desired_bool else "off"
    c_str = (current_str or "").lower().strip()
    if c_str in ("1", "true", "yes"):
        c_str = "on"
    elif c_str in ("0", "false", "no"):
        c_str = "off"
    return d_str == c_str


if __name__ == "__main__":
    main()
