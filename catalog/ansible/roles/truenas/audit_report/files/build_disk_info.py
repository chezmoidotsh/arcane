#!/usr/bin/env python3
"""
Build disk information with links to zpools.
"""
import json
import sys
from typing import Dict, List


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


def find_disk_pools(disk_name: str, pools_data: List[Dict]) -> List[str]:
    """Find which pools use a specific disk."""
    pools = []
    
    for pool in pools_data:
        topology = pool.get('topology', {})
        for _vdev_type, vdevs in topology.items():
            if vdevs:
                for vdev in vdevs:
                    if 'children' in vdev and vdev['children']:
                        for disk in vdev['children']:
                            if disk.get('name') == disk_name:
                                pools.append(pool['name'])
                                break
    
    return list(set(pools))  # Remove duplicates


def build_disk_info(disks_data: List[Dict], pools_data: List[Dict]) -> List[Dict]:
    """Build disk information list with pool associations."""
    disks = []
    
    for disk in disks_data:
        # Find which pools use this disk
        pools = find_disk_pools(disk.get('name', ''), pools_data)
        
        # Calculate formatted size
        size_gb = None
        if disk.get('size') and str(disk['size']).isdigit():
            size = int(disk['size'])
            if size > 0:
                size_gb = round(size / (1024**3), 1)
        
        disk_info = {
            'name': disk.get('name', ''),
            'serial': disk.get('serial', ''),
            'size': disk.get('size', ''),
            'type': disk.get('type', ''),
            'model': disk.get('model', 'Unknown'),
            'pools': pools  # List of pools using this disk
        }
        
        # Add size_formatted if we have a valid size
        if size_gb is not None:
            disk_info['size_formatted'] = f"{size_gb}GB"
        
        # Add optional fields if they exist and are not null/empty
        if disk.get('temperature') is not None:
            disk_info['temperature'] = disk['temperature']
        
        if disk.get('togglesmart') is not None:
            disk_info['smart_enabled'] = disk['togglesmart']
        
        # Only add non-empty values
        clean_disk = {k: v for k, v in disk_info.items() if v not in [None, '', 'Unknown'] or k in ['pools']}
        if clean_disk and clean_disk.get('name'):
            disks.append(clean_disk)
    
    # Sort by disk name
    return sorted(disks, key=lambda x: x.get('name', ''))


def main():
    """Main function to process disks and build info."""
    if len(sys.argv) != 3:
        print("Usage: build_disk_info.py <disks_json> <pools_json>", file=sys.stderr)
        sys.exit(1)
    
    disks_json = sys.argv[1]
    pools_json = sys.argv[2]
    
    try:
        disks_data = json.loads(disks_json)
        pools_data = json.loads(pools_json)
        disks_info = build_disk_info(disks_data, pools_data)
        print(json.dumps(disks_info, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()