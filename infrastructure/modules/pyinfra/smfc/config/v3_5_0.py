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

from configparser import ConfigParser
from dataclasses import dataclass, field
from io import StringIO

from .model import SuperMicroFanControlConfiguration


@dataclass
class IpmiConfig:
    command: str = "/usr/bin/ipmitool"
    fan_mode_delay: int = 10
    fan_level_delay: int = 2
    swapped_zones: bool = False


@dataclass
class CPUZoneConfig:
    enabled: bool = False
    count: int = 1
    temp_calc: int = 1
    steps: int = 6
    sensitivity: float = 3.0
    polling: int = 2
    min_temp: float = 30.0
    max_temp: float = 60.0
    min_level: int = 35
    max_level: int = 100
    hwmon_path: list[str] = field(
        default_factory=lambda: [
            "/sys/devices/platform/coretemp.0/hwmon/hwmon*/temp1_input"
        ]
    )


@dataclass
class HDZoneConfig:

    enabled: bool = False
    count: int = 1
    temp_calc: int = 1
    steps: int = 4
    sensitivity: float = 2.0
    polling: int = 10
    min_temp: float = 32.0
    max_temp: float = 46.0
    min_level: int = 35
    max_level: int = 100
    hd_names: list[str] = field(default_factory=list)
    hwmon_path: list[str] = field(default_factory=list)
    standby_guard_enabled: bool = False
    standby_hd_limit: int = 1
    smartctl_path: str = "/usr/sbin/smartctl"
    hddtemp_path: str = "/usr/sbin/hddtemp"


@dataclass
class Config(SuperMicroFanControlConfiguration):
    ipmi: IpmiConfig = field(default_factory=IpmiConfig)
    cpu_zone: CPUZoneConfig = field(default_factory=CPUZoneConfig)
    hd_zone: HDZoneConfig = field(default_factory=HDZoneConfig)

    def to_stringio(self) -> ConfigParser:
        config = ConfigParser()
        config.add_section("Ipmi")
        config.set("Ipmi", "command", self.ipmi.command)
        config.set("Ipmi", "fan_mode_delay", str(self.ipmi.fan_mode_delay))
        config.set("Ipmi", "fan_level_delay", str(self.ipmi.fan_level_delay))
        config.set("Ipmi", "swapped_zones", str(int(self.ipmi.swapped_zones)))

        config.add_section("CPU zone")
        config.set("CPU zone", "enabled", str(int(self.cpu_zone.enabled)))
        config.set("CPU zone", "count", str(self.cpu_zone.count))
        config.set("CPU zone", "temp_calc", str(self.cpu_zone.temp_calc))
        config.set("CPU zone", "steps", str(self.cpu_zone.steps))
        config.set("CPU zone", "sensitivity", str(self.cpu_zone.sensitivity))
        config.set("CPU zone", "polling", str(self.cpu_zone.polling))
        config.set("CPU zone", "min_temp", str(self.cpu_zone.min_temp))
        config.set("CPU zone", "max_temp", str(self.cpu_zone.max_temp))
        config.set("CPU zone", "min_level", str(self.cpu_zone.min_level))
        config.set("CPU zone", "max_level", str(self.cpu_zone.max_level))
        config.set("CPU zone", "hwmon_path", "\n".join(self.cpu_zone.hwmon_path))

        config.add_section("HD zone")
        config.set("HD zone", "enabled", str(int(self.hd_zone.enabled)))
        config.set("HD zone", "count", str(self.hd_zone.count))
        config.set("HD zone", "temp_calc", str(self.hd_zone.temp_calc))
        config.set("HD zone", "steps", str(self.hd_zone.steps))
        config.set("HD zone", "sensitivity", str(self.hd_zone.sensitivity))
        config.set("HD zone", "polling", str(self.hd_zone.polling))
        config.set("HD zone", "min_temp", str(self.hd_zone.min_temp))
        config.set("HD zone", "max_temp", str(self.hd_zone.max_temp))
        config.set("HD zone", "min_level", str(self.hd_zone.min_level))
        config.set("HD zone", "max_level", str(self.hd_zone.max_level))
        config.set("HD zone", "hd_names", "\n".join(self.hd_zone.hd_names))
        config.set("HD zone", "hwmon_path", "\n".join(self.hd_zone.hwmon_path))
        config.set(
            "HD zone",
            "standby_guard_enabled",
            str(int(self.hd_zone.standby_guard_enabled)),
        )
        config.set("HD zone", "standby_hd_limit", str(self.hd_zone.standby_hd_limit))
        config.set("HD zone", "smartctl_path", self.hd_zone.smartctl_path)
        config.set("HD zone", "hddtemp_path", self.hd_zone.hddtemp_path)

        buff = StringIO()
        config.write(buff)

        return buff


# Code based on `smfc.conf` configuration file v3.5.0
# ```
#   #
#   #   smfc.conf
#   #   smfc service configuration parameters
#   #
#
#
#   [Ipmi]
#   # Path for ipmitool (str, default=/usr/bin/ipmitool)
#   command=/usr/bin/ipmitool
#   # Delay time after changing IPMI fan mode (int, seconds, default=10)
#   fan_mode_delay=10
#   # Delay time after changing IPMI fan level (int, seconds, default=2)
#   fan_level_delay=2
#   # CPU and HD zones are swapped (bool, default=0).
#   swapped_zones=0
#
#
#   [CPU zone]
#   # Fan controller enabled (bool, default=0)
#   enabled=1
#   # Number of CPUs (int, default=1)
#   count=1
#   # Calculation method for CPU temperatures (int, [0-minimum, 1-average, 2-maximum], default=1)
#   temp_calc=1
#   # Discrete steps in mapping of temperatures to fan level (int, default=6)
#   steps=6
#   # Threshold in temperature change before the fan controller reacts (float, C, default=3.0)
#   sensitivity=3.0
#   # Polling time interval for reading temperature (int, sec, default=2)
#   polling=2
#   # Minimum CPU temperature (float, C, default=30.0)
#   min_temp=30.0
#   # Maximum CPU temperature (float, C, default=60.0)
#   max_temp=60.0
#   # Minimum CPU fan level (int, %, default=35)
#   min_level=35
#   # Maximum CPU fan level (int, %, default=100)
#   max_level=100
#   # Path for CPU sys/hwmon file(s) (str multi-line list, default=/sys/devices/platform/coretemp.0/hwmon/hwmon*/temp1_input)
#   # It will be automatically generated for Intel CPUs and must be specified for AMD CPUs.
#   # hwmon_path=/sys/devices/platform/coretemp.0/hwmon/hwmon*/temp1_input
#   #            /sys/devices/platform/coretemp.1/hwmon/hwmon*/temp1_input
#   # or
#   # hwmon_path=/sys/bus/pci/drivers/k10temp/0000*/hwmon/hwmon*/temp1_input
#
#
#   [HD zone]
#   # Fan controller enabled (bool, default=0)
#   enabled=1
#   # Number of HDs (int, default=1)
#   count=1
#   # Calculation of HD temperatures (int, [0-minimum, 1-average, 2-maximum], default=1)
#   temp_calc=1
#   # Discrete steps in mapping of temperatures to fan level (int, default=4)
#   steps=4
#   # Threshold in temperature change before the fan controller reacts (float, C, default=2.0)
#   sensitivity=2.0
#   # Polling interval for reading temperature (int, sec, default=10)
#   polling=10
#   # Minimum HD temperature (float, C, default=32.0)
#   min_temp=32.0
#   # Maximum HD temperature (float, C, default=46.0)
#   max_temp=46.0
#   # Minimum HD fan level (int, %, default=35)
#   min_level=35
#   # Maximum HD fan level (int, %, default=100)
#   max_level=100
#   # Names of the HDs (str multi-line list, default=)
#   # These names MUST BE specified in '/dev/disk/by-id/...' form!
#   hd_names=
#   # List of files in /sys/hwmon file system or 'hddtemp' (str multi-line list, default=)
#   # It will be automatically generated for SATA disks based on the disk names.
#   # Use `hddtemp` for SCSI disk or for other disks incompatible with `drivetemp` module.
#   # hwmon_path=/sys/class/scsi_disk/0:0:0:0/device/hwmon/hwmon*/temp1_input
#   #            /sys/class/scsi_disk/1:0:0:0/device/hwmon/hwmon*/temp1_input
#   #            hddtemp
#   # Standby guard feature for RAID arrays (bool, default=0)
#   standby_guard_enabled=0
#   # Number of HDs already in STANDBY state before the full RAID array will be forced to it (int, default=1)
#   standby_hd_limit=1
#   # Path for 'smartctl' command (str, default=/usr/sbin/smartctl).
#   # Required for 'standby guard' feature only
#   smartctl_path=/usr/sbin/smartctl
#   # Path for 'hddtemp' command (str, default=/usr/sbin/hddtemp).
#   # Required for reading of the temperature of SAS/SCSI disks.
#   hddtemp_path=/usr/sbin/hddtemp
# ```
