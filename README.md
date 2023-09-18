# OpenHIM Core Component v8.1.2

The OpenHIM core component is responsible for providing a single entry-point into an HIE as well as providing the following key features:

- Point of service client authentication and authorization
- Persistence and audit logging of all messages that flow through the OpenHIM
- Routing of messages to the correct service provider (be it an HIM orchestrator for further orchestration or the actual intended service provider)

> **To get started and to learn more about using the OpenHIM** see [the full documentation](http://openhim.org).

Some of the important information is repeated here, however, the above documentation is much more comprehensive.

See the [development road-map](http://openhim.org/docs/introduction/roadmap) for more details on what is to come!

---

"../openhim-core/README.md" [noeol] 34L, 1203C                    1,1           Top

- Point of service client authentication and authorization
- Persistence and audit logging of all messages that flow through the OpenHIM

---

## Requirements

Currently supported versions of NodeJS LTS are

| NodeJS (LTS) | MongoDB                    |
| ------------ | -------------------------- |
|  14.21.3     | >= 3.6 &#124;&#124; <= 4.2 |

### Build OpenHIM core Docker Image

git clone https://github.com/miirochristopher/openhim-core.git

cd openhim-core

npm install && npm run build

docker build -t hie/openhim-core:v8.1.2 .
---