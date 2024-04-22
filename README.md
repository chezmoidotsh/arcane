# nex.rpi

> A Raspberry Pi computer for all my homelab's critical services

## Available services

- **Core _(or system)_ services**: these services are required to run other ones

  - **DNS** based on [AdGuard Home](https://adguard.com/en/adguard-home/overview.html): provides a DNS server to block ads and trackers
  - **[Autoheal](https://github.com/willfarrell/docker-autoheal)**: provides a way to restart any unhealthy service automatically
  - **Proxy** based on [Caddy](https://caddyserver.com/): provides a simple and powerful L4 and L7 proxy for all other services
  - **VPN** based on [TailScale](https://tailscale.com/): provides a secure way to access the homelab's services from anywhere

- **Security applications**: these services are required to secure the homelab's services

  - **LDAP** based on [yaLDAP](https://github.com/chezmoi-sh/yaldap): provides an inventory of all the homelab's users and groups
  - **OIDC Provider** based on [Authelia](https://www.authelia.com/): provides a single sign-on for all the homelab's services

- **Miscellaneous applications**: these services are required to provide some useful features for the homelab
  - **[Nut UPS Daemon](https://networkupstools.org/)**: manages the UPS used to power the homelab in case of a power outage
  - **Home Dashboard** based on [Homepage](https://gethomepage.io/): provides a simple dashboard to list all the home services
  - **Status Page** based on [Gatus](https://github.com/TwiN/gatus): provides a status page to keep an eye on all the homelab's status

## Repository structure

```
nex.rpi
├── apps/                               # Directory where all the application's related files are
│   ├── config/                         # Directory with symlink to the configuration files
│   ├── images/                         # Directory where all application's images are defined
│   │   └── AAA/                        # Directory where all the images related to the application AAA are defined
│   │       ├── ci/                     # Directory where all the CI/CD related files are stored
│   │       │   ├── config/             # Directory with all the configuration files used by the CI/CD pipeline
│   │       │   ├── docker-compose.yml  # Docker compose file to test the application AAA
│   │       │   ├── goss.yaml           # Goss file to test the application AAA
│   │       │   └── goss_wait.yaml      # (optional) Goss file to wait for the application AAA to be ready
│   │       ├── live/                   # Directory where all "live" (aka. production-ready) files are stored
│   │       │   └── config/             # Directory with all the configuration files used by the application AAA
│   │       └── Dockerfile              # Dockerfile to build the image of the application AAA
│   │
│   ├── apps.<TYPE>.yml                 # Docker compose file containing all applications related to the same type/subject
│   └── docker-compose.yml              # Docker compose file grouping all applications in a single endpoint
│
├── infrastructure/                     # Directory where all the infrastructure's related files are
│   └── live/                           # Directory where all the "lived" infrastructure's related files are (1)
│
├── scripts/                            # Directory with some useful scripts used to manage this repository
└── vendor/                             # Directory where external libraries are stored (e.g. transcrypt)
```

(1) The "live" directory is the one that contains the infrastructure's related files that are currently running in the cloud.

## License

This repository is licensed under the [GLWTS Public License](LICENSE).
