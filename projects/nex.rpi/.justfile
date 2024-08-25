# Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ----------------------------------------------------------------------------

kubernetes_api := "kubernetes.nr.chezmoi.sh"

[private]
@default:
    just --choose

[doc("Generates the architecture diagram for nex·rpi")]
[group("doc")]
generate_diagram:
    d2 --layout elk --sketch architecture.d2 "assets/architecture.svg"

[doc("Syncronizes the kubeconfig file from the nex·rpi cluster")]
sync_kubeconfig:
    ssh pi@{{ kubernetes_api }} 'sudo cat /etc/rancher/k3s/k3s.yaml' | sed 's|server: https://127.0.0.1:6443|server: https://{{ kubernetes_api }}:6443|' > $KUBECONFIG

[doc("Enables maintenance mode on the nex·rpi Raspberry Pi")]
[group("maintenance")]
maintenance_enable:
    ssh pi@{{ kubernetes_api }} -- 'sudo overlayroot-chroot systemctl disable --now k3s'
    ssh pi@{{ kubernetes_api }} -- 'sudo raspi-config nonint do_overlayfs 1'
    ssh pi@{{ kubernetes_api }} -- 'sudo reboot'

[doc("Disables maintenance mode on the nex·rpi Raspberry Pi")]
[group("maintenance")]
maintenance_disable:
    ssh pi@{{ kubernetes_api }} -- 'sudo systemctl enable k3s'
    ssh pi@{{ kubernetes_api }} -- 'sudo raspi-config nonint do_overlayfs 0'
    ssh pi@{{ kubernetes_api }} -- 'sudo reboot'