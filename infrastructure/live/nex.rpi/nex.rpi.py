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
import packages.nut as nut
import packages.overlayfs as overlayfs
from pyinfra.operations import files, server

with overlayfs.TemporaryDisableOverlayFS():
    nut.install(
        config_files=[
            "config/etc.nut/nut.conf",
            "config/etc.nut/ups.conf",
            "config/etc.nut/upsd.conf",
            "config/etc.nut/upsd.users",
        ],
        _sudo=True,
    )

    # TODO: Add proper installation of docker-rootless
    files.put(
        name="Configure rootless-docker service",
        src="config/HOME.config.systemd.user.docker.service.d/override.conf",
        dest="/home/pi/.config/systemd/user/docker.service.d/override.conf",
        user="pi",
        group="pi",
        mode=True,
    )

    server.sysctl(
        name="Allow to route PING packets",
        key="net.ipv4.ping_group_range",
        value="0 2147483647",
        persist=True,
        persist_file="/etc/sysctl.d/99-docker-rootless-overrides.conf",
    )
    server.sysctl(
        name="Allow rootless container to bind on all ports",
        key="net.ipv4.ip_unprivileged_port_start",
        value=0,
        persist=True,
        persist_file="/etc/sysctl.d/99-docker-rootless-overrides.conf",
    )
