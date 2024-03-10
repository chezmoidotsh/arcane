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
#
# This document manages all DNS records used by the nex.rpi project.

# -<DNS records>---------------------------------------------------------------

data "cloudflare_zones" "zones" {
  filter {
    name = var.dns_zone
  }
}

module "dns" {
  source  = "git::https://github.com/chezmoi-sh/libraries.git//terraform/dns?ref=1b7cad92b801451d198177a33395c8e262e81dd0"
  project = "nex.rpi"
  zone_id = data.cloudflare_zones.zones.zones[0].id

  records = [
    { type = "A", name = "*.nex-rpi", value = var.main_ip, comment = "Securised SBC for critical services" },
    { type = "CNAME", name = "home", value = "home.nex-rpi.${var.dns_zone}", ttl = 3600, comment = "Static homepage" },
    { type = "CNAME", name = "sso", value = "sso.nex-rpi.${var.dns_zone}", ttl = 3600, comment = "Single sign-on instance" },
    { type = "CNAME", name = "ldap.sso", value = "sso.nex-rpi.${var.dns_zone}", ttl = 3600, comment = "LDAP instance" },
    { type = "CNAME", name = "status", value = "status.nex-rpi.${var.dns_zone}", ttl = 3600, comment = "Status page" },
  ]
}
