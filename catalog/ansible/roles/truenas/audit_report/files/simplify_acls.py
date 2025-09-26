#!/usr/bin/env python3
"""
Simplify ACL entries for better readability in reports.
"""
import json
import sys
from typing import Dict, List


def simplify_permissions(perms: Dict) -> str:
    """Convert complex permission object to simple string."""
    if not perms:
        return "none"
    
    # Handle BASIC permissions (common in NFS4)
    if "BASIC" in perms:
        basic_perm = perms["BASIC"]
        perm_map = {
            "FULL_CONTROL": "rwx",
            "MODIFY": "rw-",
            "READ": "r--",
            "WRITE": "-w-",
            "EXECUTE": "--x"
        }
        return perm_map.get(basic_perm, basic_perm.lower())
    
    # Handle individual permissions (POSIX style)
    read = "r" if perms.get("READ", False) else "-"
    write = "w" if perms.get("WRITE", False) else "-"
    execute = "x" if perms.get("EXECUTE", False) else "-"
    
    return f"{read}{write}{execute}"


def simplify_flags(flags: Dict) -> str:
    """Convert complex flags object to simple string."""
    if not flags:
        return ""
    
    # Handle BASIC flags
    if "BASIC" in flags:
        basic_flag = flags["BASIC"]
        if basic_flag == "INHERIT":
            return "inherit"
        return basic_flag.lower()
    
    # Handle individual flags
    flag_parts = []
    if flags.get("FILE_INHERIT", False):
        flag_parts.append("file")
    if flags.get("DIRECTORY_INHERIT", False):
        flag_parts.append("dir")
    if flags.get("INHERITED", False):
        flag_parts.append("inherited")
    
    return ",".join(flag_parts) if flag_parts else ""


def simplify_tag(tag: str, acl_id: int, users_map: Dict, groups_map: Dict) -> str:
    """Convert tag and ID to readable format with name resolution."""
    if tag == "USER_OBJ":
        return "owner"
    elif tag == "GROUP_OBJ":
        return "group"
    elif tag == "OTHER":
        return "other"
    elif tag == "owner@":
        return "owner"
    elif tag == "group@":
        return "group"
    elif tag == "everyone@":
        return "everyone"
    elif tag == "USER" and acl_id > 0:
        username = users_map.get(acl_id, f"uid:{acl_id}")
        return f"user:{username}"
    elif tag == "GROUP" and acl_id > 0:
        groupname = groups_map.get(acl_id, f"gid:{acl_id}")
        return f"group:{groupname}"
    else:
        return tag.lower()


def build_users_map(users_data: List[Dict]) -> Dict[int, str]:
    """Build mapping from UID to username."""
    users_map = {}
    for user in users_data:
        uid = user.get('uid')
        username = user.get('username')
        if uid is not None and username:
            users_map[uid] = username
    return users_map


def build_groups_map(groups_data: List[Dict]) -> Dict[int, str]:
    """Build mapping from GID to group name."""
    groups_map = {}
    for group in groups_data:
        gid = group.get('gid')
        groupname = group.get('name') or group.get('group')  # Handle different field names
        if gid is not None and groupname:
            groups_map[gid] = groupname
    return groups_map


def simplify_acls(acls_data: List[Dict], users_data: List[Dict], groups_data: List[Dict]) -> List[Dict]:
    """Simplify ACL entries for better readability with user/group name resolution."""
    simplified = []
    
    # Build lookup maps
    users_map = build_users_map(users_data)
    groups_map = build_groups_map(groups_data)
    
    for acl in acls_data:
        if not acl.get("entries"):
            # Skip ACLs without entries (trivial ones)
            continue
            
        simplified_acl = {
            "dataset": acl.get("dataset", ""),
            "mountpoint": acl.get("mountpoint", ""),
            "type": acl.get("acltype", "posix").lower(),
            "permissions": []
        }
        
        # Only show if non-trivial
        if not acl.get("trivial", True):
            simplified_acl["custom"] = True
        
        for entry in acl.get("entries", []):
            tag = entry.get("tag", "")
            acl_id = entry.get("id", -1)
            perms = entry.get("perms", {})
            flags = entry.get("flags", {})
            entry_type = entry.get("type", "ALLOW")
            
            # Skip inherited entries for cleaner output
            if flags and flags.get("INHERITED", False):
                continue
            
            # Skip entries with id: -1 unless they're meaningful
            if acl_id == -1 and tag not in ["USER_OBJ", "GROUP_OBJ", "OTHER", "owner@", "group@", "everyone@"]:
                continue
            
            simplified_entry = {
                "who": simplify_tag(tag, acl_id, users_map, groups_map),
                "access": simplify_permissions(perms)
            }
            
            # Add flags if meaningful
            flag_str = simplify_flags(flags)
            if flag_str:
                simplified_entry["flags"] = flag_str
            
            # Add type if not ALLOW (which is default)
            if entry_type != "ALLOW":
                simplified_entry["type"] = entry_type.lower()
            
            simplified_acl["permissions"].append(simplified_entry)
        
        # Only add if has meaningful permissions
        if simplified_acl["permissions"]:
            simplified.append(simplified_acl)
    
    return simplified


def main():
    """Main function to process ACLs and simplify them."""
    if len(sys.argv) != 4:
        print("Usage: simplify_acls.py <acls_json> <users_json> <groups_json>", file=sys.stderr)
        sys.exit(1)
    
    acls_json = sys.argv[1]
    users_json = sys.argv[2]
    groups_json = sys.argv[3]
    
    try:
        acls_data = json.loads(acls_json)
        users_data = json.loads(users_json)
        groups_data = json.loads(groups_json)
        simplified = simplify_acls(acls_data, users_data, groups_data)
        print(json.dumps(simplified, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()