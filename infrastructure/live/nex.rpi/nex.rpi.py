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

with overlayfs.TemporaryDisableOverlayFS():
    nut.install(
        config_files=[
            "config/etc.nut/nut.conf",
            "config/etc.nut/ups.conf",
            "config/etc.nut/upsd.conf",
            "config/etc.nut/upsd.users"            
        ],
        _sudo=True
    )
