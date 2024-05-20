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
from io import StringIO

import packages.smfc as smfc
from packages.smfc.config.v3_5_0 import Config as SuperMicroFanCrontrol
from packages.smfc.config.v3_5_0 import CPUZoneConfig, HDZoneConfig
from pyinfra import host
from pyinfra.facts.server import Command
from pyinfra.operations import files, server

# Step 1 → Load required Kernel module
persistent_modules = files.put(
    name="Load `drivetemp` and `coretemp` kernel module at boot",
    src=StringIO(
        """
                # Required modules for Super Micro Fan Control
                coretemp
                drivetemp
                 """
    ),
    dest="/etc/modules-load.d/hwmon.conf",
)
if persistent_modules.changed:
    server.modprobe(name="Load `coretemp` kernel module", module="coretemp")
    server.modprobe(name="Load `drivetemp` kernel module", module="drivetemp")

# Step 2 → Install SuperMicro Fan Control
files.directory(name="Create directory for hddtemp-lt", path="/opt/hddtemp-lt")
files.put(
    name="(Hack) Download a smartctl → hddtemp wrapper that will be used by SuperMicro Fan Control",
    src="files/hddtemp-lt",
    dest="/opt/hddtemp-lt/hddtemp-lt",
    mode="755",
)

available_drives = host.get_fact(Command, "lsblk --nodeps --noheadings --output name")

smfc.install(version="v3.5.0")
smfc.configure(
    SuperMicroFanCrontrol(
        cpu_zone=CPUZoneConfig(
            enabled=True,
            steps=10,
            min_temp=45,
            max_temp=80,
            min_level=25,
            max_level=100,
            hwmon_path=["/sys/devices/platform/coretemp.0/hwmon/hwmon*/temp1_input"],
        ),
        hd_zone=HDZoneConfig(
            enabled=True,
            steps=6,
            count=len(available_drives.splitlines()),
            min_temp=35,
            max_temp=48,
            min_level=25,
            max_level=50,
            hd_names=[f"/dev/{drive}" for drive in available_drives.splitlines()],
            hddtemp_path="/opt/hddtemp-lt/hddtemp-lt",  # This is the path to the smartctl → hddtemp wrapper
        ),
    )
)
