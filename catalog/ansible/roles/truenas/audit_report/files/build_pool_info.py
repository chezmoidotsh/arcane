#!/usr/bin/env python3
"""
Build pool information with topology and disk details.
"""
import json
import sys
from typing import Dict, List, Any


def build_pool_info(pools_data: List[Dict], disks_data: List[Dict]) -> Dict[str, Any]:
    """Build pool information dictionary."""
    pools = {}
    
    # Create mapping from UUID/path to disk info
    disk_map = {}
    for disk in disks_data:
        disk_map[disk.get('name', '')] = disk
        if disk.get('serial'):
            disk_map[disk['serial']] = disk
    
    for pool in pools_data:
        pool_name = pool['name']
        
        pool_info = {
            'status': pool.get('status', 'UNKNOWN'),
            'healthy': pool.get('healthy', False),
            'guid': pool.get('guid', ''),
        }
        
        # Add topology information
        topology = pool.get('topology', {})
        if topology:
            pool_info['topology'] = {}
            
            for vdev_type, vdevs in topology.items():
                if vdevs:  # Only add if there are vdevs
                    pool_info['topology'][vdev_type] = []
                    
                    for vdev in vdevs:
                        vdev_info = {
                            'type': vdev.get('type', 'unknown')
                        }
                        
                        # Add children (disks) if available
                        if 'children' in vdev and vdev['children']:
                            vdev_info['disks'] = []
                            for disk in vdev['children']:
                                disk_name = disk.get('name', 'unknown')
                                disk_path = disk.get('path', '')
                                
                                # Try to find corresponding physical disk
                                physical_disk = None
                                disk_identifier = disk.get('disk', '')
                                
                                # Look for physical disk by name or identifier
                                for phys_disk in disks_data:
                                    if (phys_disk.get('name') == disk_identifier or 
                                        disk_identifier in phys_disk.get('name', '')):
                                        physical_disk = phys_disk
                                        break
                                
                                disk_info = {
                                    'uuid': disk_name,
                                    'path': disk_path,
                                    'status': disk.get('status', 'UNKNOWN')
                                }
                                
                                # Add physical disk identifier if found
                                if physical_disk:
                                    disk_info['device'] = physical_disk.get('name', disk_identifier)
                                    if physical_disk.get('serial'):
                                        disk_info['serial'] = physical_disk['serial']
                                else:
                                    disk_info['device'] = disk_identifier
                                
                                # Only add non-empty values
                                clean_disk = {k: v for k, v in disk_info.items() if v}
                                if clean_disk:
                                    vdev_info['disks'].append(clean_disk)
                        
                        pool_info['topology'][vdev_type].append(vdev_info)
        
        pools[pool_name] = pool_info
    
    return pools


def main():
    """Main function to process pools and build info."""
    if len(sys.argv) != 3:
        print("Usage: build_pool_info.py <pools_json> <disks_json>", file=sys.stderr)
        sys.exit(1)
    
    pools_json = sys.argv[1]
    disks_json = sys.argv[2]
    
    try:
        pools_data = json.loads(pools_json)
        disks_data = json.loads(disks_json)
        pools_info = build_pool_info(pools_data, disks_data)
        print(json.dumps(pools_info, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()