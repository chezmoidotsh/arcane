# Common utility functions.
# Code that it'd be nice to have in Ansible's 'setup' module.

import re
from ..module_utils.middleware import MiddleWare as MW
# For parsing version numbers
from packaging import version

# Version of TrueNAS we're running, so that we know how to invoke
# middlewared.
tn_version = None


def validate_truenas_scale(module=None, min_version="22.02"):
    """
    Validate that we're running on TrueNAS Scale with minimum version.
    
    Args:
        module: Ansible module instance for error reporting (optional)
        min_version: Minimum required TrueNAS Scale version
        
    Returns:
        dict: TrueNAS version info if valid
        
    Raises:
        SystemExit: If not TrueNAS Scale or version too old
    """
    try:
        tn_version = get_tn_version()
    except Exception as e:
        error_msg = f"Error getting TrueNAS version: {e}"
        if module:
            module.fail_json(msg=error_msg)
        else:
            print(f'{{"failed":true, "msg": "{error_msg}"}}')
            import sys
            sys.exit(1)

    # Check if it's TrueNAS Scale
    if tn_version['name'] != "TrueNAS" or tn_version['type'] not in {"SCALE", "COMMUNITY_EDITION"}:
        error_msg = f"This module only supports TrueNAS Scale. Detected: {tn_version['name']} {tn_version['type']}"
        if module:
            module.fail_json(msg=error_msg)
        else:
            print(f'{{"failed":true, "msg": "{error_msg}"}}')
            import sys
            sys.exit(1)

    # Check minimum version
    if tn_version['version'] < version.parse(min_version):
        error_msg = f"This module requires TrueNAS Scale {min_version} or later. Detected: {tn_version['version']}"
        if module:
            module.fail_json(msg=error_msg)
        else:
            print(f'{{"failed":true, "msg": "{error_msg}"}}')
            import sys
            sys.exit(1)
            
    return tn_version


# XXX - It would be nice to extend the 'setup' module to gather this
# information, set some facts, and then any module that needs them can
# refer to those facts.
def get_tn_version():
    """Get the version of TrueNAS being run"""

    # Return memoized data if we've already looked it up.
    global tn_version
    if tn_version is not None:
        return tn_version

    mw = MW.client()

    product_name = None
    product_type = None
    try:
        # product_type is a string like "CORE", "SCALE", or
        # "ENTERPRISE".
        product_type = mw.call("system.product_type", output='str')

        # product_version is a string like "TrueNAS-13.0-U5", or
        # "TrueNAS-SCALE-22.12.3.1"
        full_version = mw.call("system.version", output='str')

        # product_name is a string like "TrueNAS".
        #
        # TrueNAS CORE has `system.product_name' but SCALE doesn't, at
        # least not after some version.
        if product_type in ("CORE"):
            product_name = mw.call("system.product_name", output='str')
    except Exception:
        # XXX - Maybe try to soldier on with what we've got?
        raise

    # Extract additional information from 'full_version'.
    # This is a string of the form
    #
    # <product_name>-<version>
    # <product_name>-<product_type>-<version>
    #
    # Though you probably shouldn't rely on this too much
    match = re.match(r'^(?:(\w+)-)(?:(\w+)-)?(\d.*)', full_version)
    if match:
        if product_name is None:
            product_name = match[1]
        if product_type is None and match[2] != "":
            product_type = match[2]
        sys_version = match[3]
    else:
        # Can't parse the version string, so just use what we were
        # given.
        sys_version = full_version

    # Parsing it as a version gives us a version object that's easy to
    # compare against another version of interest.
    sys_version = version.parse(sys_version)

    tn_version = {
        "name": product_name,
        "type": product_type,
        "version": sys_version,
    }

    return tn_version
