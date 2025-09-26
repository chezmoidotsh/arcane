#!/usr/bin/env python3
"""
Merge ACL information into dataset tree structure.
"""
import json
import sys
from typing import Dict, Any


def merge_acls_into_tree(datasets_tree: Dict[str, Any], acls_by_dataset: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ACL information into dataset tree."""
    
    def merge_acls_recursive(tree_node: Dict, current_path: str = "") -> None:
        """Recursively traverse tree and add ACLs where applicable."""
        
        # Check if current node has ACL info
        if current_path in acls_by_dataset:
            acl_info = acls_by_dataset[current_path]
            if acl_info.get('permissions'):  # Only add if has meaningful permissions
                tree_node['acl'] = {
                    'type': acl_info.get('type', 'posix'),
                    'permissions': acl_info.get('permissions', [])
                }
                # Add custom flag if specified
                if acl_info.get('custom'):
                    tree_node['acl']['custom'] = True
        
        # Recursively process child datasets
        if 'datasets' in tree_node and isinstance(tree_node['datasets'], dict):
            for child_name, child_node in tree_node['datasets'].items():
                # Build child path
                if current_path:
                    child_path = f"{current_path}/{child_name}"
                else:
                    child_path = child_name
                
                merge_acls_recursive(child_node, child_path)
    
    # Create a copy to avoid modifying the original
    merged_tree = json.loads(json.dumps(datasets_tree))
    
    # Process each pool
    for pool_name, pool_tree in merged_tree.items():
        merge_acls_recursive(pool_tree, pool_name)
    
    return merged_tree


def main():
    """Main function to merge ACLs into datasets tree."""
    if len(sys.argv) != 3:
        print("Usage: merge_acls_datasets.py <datasets_tree_json> <acls_by_dataset_json>", file=sys.stderr)
        sys.exit(1)
    
    datasets_tree_json = sys.argv[1]
    acls_by_dataset_json = sys.argv[2]
    
    try:
        datasets_tree = json.loads(datasets_tree_json)
        acls_by_dataset = json.loads(acls_by_dataset_json)
        
        merged_tree = merge_acls_into_tree(datasets_tree, acls_by_dataset)
        print(json.dumps(merged_tree, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()