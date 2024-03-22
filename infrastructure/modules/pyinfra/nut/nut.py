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
from os import path

from pyinfra.api import deploy
from pyinfra.operations import apt, files, systemd


@deploy("Install and configure `nut`")
def install_nut(config_files: list[str]):
    apt.packages(name="Install Nut UPS Software package", packages=["nut"], update=True)

    for file in config_files:
        files.put(
            name=f"Upload {file} configuration file (/etc/nut/{path.basename(file)})",
            src=f"{file}",
            dest=f"/etc/nut/{path.basename(file)}",
            user="root",
            group="nut",
            mode=True,
        )

    systemd.service(
        name="(re)Start Nut UPS service and enable auto-start",
        service="nut-server.service",
        running=True,
        enabled=True,
    )
