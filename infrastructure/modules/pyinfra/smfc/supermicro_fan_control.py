# Copyright 2024
#
# Everyone is permitted to copy, distribute, modify, merge, sell, publish,
# sublicense or whatever the fuck they want with this software but at their
# OWN RISK.
# The author has absolutely no fucking clue what the code in this project
# does. It might just fucking work or not, there is no third option.
#
# IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.
# ---

from typing import Final

from pyinfra import host
from pyinfra.api import deploy
from pyinfra.facts.files import Directory, File
from pyinfra.facts.server import KernelModules, LinuxName
from pyinfra.facts.systemd import SystemdStatus
from pyinfra.operations import apt, files, git, systemd

from .config.model import SuperMicroFanControlConfiguration
from .config.v3_5_0 import Config

DEFAULTS: Final[dict] = {
    "smfc.version": "v3.5.0",
    "smfc.configuration": Config(),
}


@deploy("Install Super Micro Fan Control")
def install(
    version: str = DEFAULTS["smfc.version"],
    service_enabled=True,
    start_after_install=True,
):
    """
    Install SuperMicro Fan Control.

    Args:
        version (str, optional): The version of SuperMicro Fan Control to install. Defaults to the value specified in DEFAULTS["smfc.version"].
        service_enabled (bool, optional): Whether to enable the SuperMicro Fan Control service after installation. Defaults to True.
        start_after_install (bool, optional): Whether to start the SuperMicro Fan Control service after installation. Defaults to True.

    Raises:
        Exception: If the `coretemp` (Intel) or `k10temp` (AMD) module is not enabled.
        NotImplementedError: If the Linux distribution is not Debian-based.

    Returns:
        None
    """

    # Step 1 - Check if all requirements are met
    kmodules = host.get_fact(KernelModules)
    if "coretemp" not in kmodules and "k10temp" not in kmodules:
        raise Exception("`coretemp` (Intel) or `k10temp` (AMD) module must be enabled.")

    services = host.get_fact(SystemdStatus)
    if "smfc.service" in services and services["smfc.service"] == "running":
        systemd.service(
            name="Stop the SuperMicro Fan Control service",
            service="smfc",
            running=False,
        )

    # Step 2 - Install required packages
    if host.get_fact(LinuxName) == "Debian":
        apt.packages(
            name="Install required dependencies (ipmitool and smartmontools)",
            packages=["ipmitool", "smartmontools"],
            no_recommends=True,
        )
    else:
        raise NotImplementedError("Only Debian-based distributions are supported.")

    # Step 3 - Install SMFC
    # source: https://github.com/petersulyok/smfc/blob/main/install.sh

    # Step 3.1 - Clone the repository and update the preset file
    if not host.get_fact(Directory, f"/opt/smfc/{version}"):
        git.repo(
            name=f"Clone the SuperMicro Fan Control repository (version {version})",
            src="https://github.com/petersulyok/smfc",
            dest=f"/opt/smfc/{version}",
            branch=version,
        )

    files.link(
        name=f"Promote SuperMicro Fan Control ({version})",
        path="/opt/smfc/current",
        target=f"/opt/smfc/{version}/src",
    )

    files.replace(
        name="Update SuperMicro Fan Control preset file with the path to the configuration file",
        path="/opt/smfc/current/smfc",
        text="/opt/smfc/smfc.conf",
        replace="/etc/smfc/smfc.conf",
    )

    files.replace(
        name="Update SuperMicro Fan Control service file with the path to Python script",
        path="/opt/smfc/current/smfc.service",
        text="/opt/smfc/smfc.py",
        replace="/opt/smfc/current/smfc.py",
    )

    # Step 3.2 - Create all symlinks (installation)
    files.link(
        name="Create a symlink /etc/default/smfc → /opt/smfc/current/smfc",
        path="/etc/default/smfc",
        target="/opt/smfc/current/smfc",
    )

    files.link(
        name="Create a symlink /etc/smfc/smfc_default.conf → /opt/smfc/current/smfc.conf",
        path="/etc/smfc/smfc_default.conf",
        target="/opt/smfc/current/smfc.conf",
    )
    # NOTE: if the configuration file does not exist, create a symlink to the default configuration file
    if not host.get_fact(File, path="/etc/smfc/smfc.conf"):
        files.link(
            name="Create a symlink /etc/smfc/smfc.conf → /etc/smfc/smfc_default.conf",
            path="/etc/smfc/smfc.conf",
            target="/etc/smfc/smfc_default.conf",
        )

    service_config = files.link(
        name="Create a symlink /etc/systemd/system/smfc.service → /opt/smfc/current/smfc.service",
        path="/etc/systemd/system/smfc.service",
        target="/opt/smfc/current/smfc.service",
    )

    # Step 3.3 - Enable and start the service
    if service_config.changed:
        systemd.daemon_reload()

    systemd.service(
        name="Enable and start the SuperMicro Fan Control service",
        service="smfc",
        running=start_after_install,
        enabled=service_enabled,
    )


@deploy("Configure Super Micro Fan Control")
def configure(
    configuration: SuperMicroFanControlConfiguration = DEFAULTS["smfc.configuration"],
):
    """
    Configures the SuperMicro Fan Control by updating the configuration file and restarting the service.

    Args:
        configuration (SuperMicroFanControlConfiguration, optional): The configuration for the SuperMicro Fan Control.
            Defaults to the value specified in DEFAULTS["smfc.configuration"].

    Returns:
        None
    """

    config = files.put(
        name="Update Super Micro Fan Controller configuration",
        src=configuration.to_stringio(),
        dest="/etc/smfc/smfc.conf",
    )

    if config.changed:
        systemd.service(
            name="Restart the SuperMicro Fan Control service",
            service="smfc",
            restarted=True,
        )
