#!/usr/bin/env python3
"""
Build recursive dataset tree structure from TrueNAS dataset list.
"""
import json
import sys
from typing import Dict, List, Any


def format_size(size_bytes: str) -> str:
    """Convert size in bytes to human readable format."""
    if size_bytes in ['none', 'inherit', '0', 0, None]:
        return None  # Will be filtered out
    
    try:
        size = int(size_bytes)
        if size == 0:
            return None  # Will be filtered out
    except (ValueError, TypeError):
        return str(size_bytes) if size_bytes not in ['inherit'] else None
    
    # Define size units
    units = [
        (1024**4, 'TB'),
        (1024**3, 'GB'), 
        (1024**2, 'MB'),
        (1024**1, 'KB'),
        (1, 'B')
    ]
    
    for factor, unit in units:
        if size >= factor:
            value = size / factor
            # Format with appropriate precision
            if value >= 100:
                return f"{value:.0f}{unit}"
            elif value >= 10:
                return f"{value:.1f}{unit}"
            else:
                return f"{value:.2f}{unit}"
    
    return f"{size}B"


def clean_properties(props: dict) -> dict:
    """Remove properties with inherit, none, null or empty values."""
    cleaned = {}
    for key, value in props.items():
        if value not in ['inherit', 'none', None, '', 'null', 'off']:
            cleaned[key] = value
    return cleaned


def build_dataset_tree(datasets: List[Dict], pool_name: str) -> Dict[str, Any]:
    """Build recursive tree structure for datasets in a pool."""
    
    def add_dataset_to_tree(tree: Dict, dataset: Dict, path_parts: List[str], full_path: str) -> None:
        """Recursively add dataset to tree structure."""
        if not path_parts:
            return
            
        current_name = path_parts[0]
        remaining_parts = path_parts[1:]
        
        if current_name not in tree:
            # Find the dataset info for this path
            dataset_info = None
            if remaining_parts:
                # This is an intermediate path, find the dataset
                intermediate_path = pool_name + '/' + '/'.join(path_parts[:len(path_parts) - len(remaining_parts)])
                for d in datasets:
                    if d['name'] == intermediate_path:
                        dataset_info = d
                        break
            else:
                # This is the final dataset
                dataset_info = dataset
            
            if dataset_info:
                # Extract core properties with size formatting
                dataset_props = {
                    'type': dataset_info.get('type', 'filesystem'),
                    'mountpoint': dataset_info.get('mountpoint', 'none'),
                }
                
                # Add compression if not inherit
                compression = dataset_info.get('compression', {}).get('value', 'inherit')
                if compression != 'inherit':
                    dataset_props['compression'] = compression
                
                # Add quota if not none/inherit
                quota = format_size(dataset_info.get('quota', {}).get('parsed', 'none'))
                if quota:
                    dataset_props['quota'] = quota
                    
                # Add reservation if not none/inherit
                reservation = format_size(dataset_info.get('reservation', {}).get('parsed', 'none'))
                if reservation:
                    dataset_props['reservation'] = reservation
                
                # Add extended properties if available
                if 'properties' in dataset_info:
                    props = dataset_info['properties']
                    extended_props = {
                        'description': props.get('description', {}).get('value', ''),
                        'recordsize': props.get('recordsize', {}).get('value', 'inherit'),
                        'atime': props.get('atime', {}).get('value', 'inherit'),
                        'readonly': props.get('readonly', {}).get('value', 'inherit'),
                        'deduplication': props.get('deduplication', {}).get('value', 'inherit'),
                        'sync': props.get('sync', {}).get('value', 'inherit'),
                        'snapdir': props.get('snapdir', {}).get('value', 'inherit'),
                        'copies': props.get('copies', {}).get('value', 'inherit'),
                        'refquota': format_size(props.get('refquota', {}).get('parsed', 'none')),
                        'refreservation': format_size(props.get('refreservation', {}).get('parsed', 'none')),
                    }
                    dataset_props.update(clean_properties(extended_props))
                
                # Note: ACLs are extracted separately in the process.yml task
                
                dataset_props['datasets'] = {}
                tree[current_name] = dataset_props
            else:
                # Placeholder for intermediate paths - only show type and datasets
                tree[current_name] = {
                    'type': 'filesystem',
                    'datasets': {}
                }
        
        if remaining_parts:
            add_dataset_to_tree(tree[current_name]['datasets'], dataset, remaining_parts, full_path)
    
    # Filter datasets for this pool
    pool_datasets = [d for d in datasets if d.get('pool') == pool_name]
    
    tree = {}
    
    # Find root dataset
    root_dataset = None
    for dataset in pool_datasets:
        if dataset['name'] == pool_name:
            root_dataset = dataset
            break
    
    if root_dataset:
        # Extract core properties for root with size formatting
        root_props = {
            'type': root_dataset.get('type', 'filesystem'),
            'mountpoint': root_dataset.get('mountpoint', f'/mnt/{pool_name}'),
        }
        
        # Add compression if not inherit
        compression = root_dataset.get('compression', {}).get('value', 'inherit')
        if compression != 'inherit':
            root_props['compression'] = compression
        
        # Add quota if not none/inherit
        quota = format_size(root_dataset.get('quota', {}).get('parsed', 'none'))
        if quota:
            root_props['quota'] = quota
            
        # Add reservation if not none/inherit
        reservation = format_size(root_dataset.get('reservation', {}).get('parsed', 'none'))
        if reservation:
            root_props['reservation'] = reservation
        
        # Add extended properties if available
        if 'properties' in root_dataset:
            props = root_dataset['properties']
            extended_props = {
                'description': props.get('description', {}).get('value', ''),
                'recordsize': props.get('recordsize', {}).get('value', 'inherit'),
                'atime': props.get('atime', {}).get('value', 'inherit'),
                'readonly': props.get('readonly', {}).get('value', 'inherit'),
                'deduplication': props.get('deduplication', {}).get('value', 'inherit'),
                'sync': props.get('sync', {}).get('value', 'inherit'),
                'snapdir': props.get('snapdir', {}).get('value', 'inherit'),
                'copies': props.get('copies', {}).get('value', 'inherit'),
                'refquota': format_size(props.get('refquota', {}).get('parsed', 'none')),
                'refreservation': format_size(props.get('refreservation', {}).get('parsed', 'none')),
            }
            root_props.update(clean_properties(extended_props))
        
        # Note: ACLs are extracted separately in the process.yml task
        
        root_props['datasets'] = {}
        
        # Don't use 'root' key, return the properties directly as the pool level
        tree = root_props
    
    # Process all other datasets
    for dataset in pool_datasets:
        if dataset['name'] == pool_name:
            continue  # Skip root, already processed
            
        # Get relative path
        if dataset['name'].startswith(pool_name + '/'):
            relative_path = dataset['name'][len(pool_name) + 1:]
            path_parts = relative_path.split('/')
            
            if root_dataset:
                add_dataset_to_tree(tree['datasets'], dataset, path_parts, dataset['name'])
            else:
                # No root dataset, create tree from first level
                add_dataset_to_tree(tree, dataset, path_parts, dataset['name'])
    
    return tree


def main():
    """Main function to process datasets and build tree."""
    if len(sys.argv) != 3:
        print("Usage: build_dataset_tree.py <datasets_json> <pool_name>", file=sys.stderr)
        sys.exit(1)
    
    datasets_json = sys.argv[1]
    pool_name = sys.argv[2]
    
    try:
        datasets = json.loads(datasets_json)
        tree = build_dataset_tree(datasets, pool_name)
        print(json.dumps(tree, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()