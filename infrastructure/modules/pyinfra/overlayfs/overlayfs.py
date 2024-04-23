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
from pyinfra import host
from pyinfra.api import FactBase, deploy
from pyinfra.operations import files, server


@deploy("Enable OverlayFS")
def enable_overlayfs():
    server.shell(
        name="raspi-config nonint do_overlayfs 0",
        commands=["raspi-config nonint do_overlayfs 0"],
    )

    server.mount(
        name="Remount /boot/firmware in read-write mode",
        path="/boot/firmware",
        mounted=True,
        options=["rw"],
    )

    files.replace(
        name="Configure overlayfs to only use it on the / partition",
        path="/boot/firmware/cmdline.txt",
        text="^overlayroot=tmpfs ",
        replace="overlayroot=tmpfs:recurse=0 ",
    )

    server.reboot(name="Reboot to apply changes")


@deploy("Disable OverlayFS")
def disable_overlayfs():
    server.shell(
        name="raspi-config nonint do_overlayfs 1",
        commands=["raspi-config nonint do_overlayfs 1"],
    )

    server.reboot(name="Reboot to apply changes")
    server.shell(name="Wait for system to synchronize date", commands=["sleep 30"])


class OverlayFSEnabled(FactBase):
    """
    Returns a boolean indicating whether overlayfs is enabled
    """

    command = "df --type=overlay --output=target || exit 0"

    def process(self, output):
        return len(output) > 1


class TemporaryDisableOverlayFS:
    """
    Context manager to temporarily disable OverlayFS
    """

    def __enter__(self):
        if host.get_fact(OverlayFSEnabled):
            disable_overlayfs(_sudo=True)

    def __exit__(self, *args):
        enable_overlayfs(_sudo=True)
