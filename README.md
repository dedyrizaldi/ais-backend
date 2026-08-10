
```
ais-backend
├─ .prettierrc
├─ eslint.config.mjs
├─ nest-cli.json
├─ package-lock.json
├─ package.json
├─ README.md
├─ src
│  ├─ ais
│  │  ├─ ais.module.ts
│  │  ├─ ais.service.ts
│  │  ├─ assembler
│  │  │  └─ ais-fragment-assembler.ts
│  │  ├─ decoder
│  │  │  ├─ ais-decoder.service.ts
│  │  │  └─ ais-type5.decoder.ts
│  │  ├─ interfaces
│  │  │  ├─ ais-fragment.interface.ts
│  │  │  ├─ completed-ais-message.interface.ts
│  │  │  └─ decoded-ais.interface.ts
│  │  └─ parser
│  │     └─ ais-parser.ts
│  ├─ app.controller.spec.ts
│  ├─ app.controller.ts
│  ├─ app.module.ts
│  ├─ app.service.ts
│  ├─ gateway
│  │  ├─ ais.gateway.ts
│  │  └─ gateway.module.ts
│  ├─ logger
│  │  ├─ ais-debug-file.service.ts
│  │  ├─ logger.enum.ts
│  │  ├─ logger.module.ts
│  │  └─ logger.service.ts
│  ├─ main.ts
│  ├─ nmea
│  │  ├─ enums
│  │  │  └─ sentence-type.enum.ts
│  │  ├─ interfaces
│  │  │  ├─ nmea-message.interface.ts
│  │  │  └─ normalized-nmea.interface.ts
│  │  ├─ nmea.module.ts
│  │  ├─ nmea.processor.ts
│  │  ├─ nmea.service.ts
│  │  └─ utils
│  │     └─ nmea-normalizer.ts
│  ├─ receiver
│  │  ├─ data
│  │  │  └─ vts.json
│  │  ├─ interfaces
│  │  │  └─ vts.interface.ts
│  │  ├─ receiver.controller.ts
│  │  ├─ receiver.module.ts
│  │  └─ receiver.service.ts
│  ├─ tcp
│  │  ├─ interfaces
│  │  │  └─ tcp-client.interface.ts
│  │  ├─ tcp.client.ts
│  │  ├─ tcp.module.ts
│  │  ├─ tcp.service.spec.ts
│  │  └─ tcp.service.ts
│  └─ vessel
│     ├─ cache
│     │  └─ vessel.cache.ts
│     ├─ interfaces
│     │  └─ vessel.interface.ts
│     ├─ mapper
│     │  └─ ais-vessel.mapper.ts
│     ├─ scheduler
│     │  └─ vessel.scheduler.ts
│     ├─ vessel.controller.ts
│     ├─ vessel.module.ts
│     └─ vessel.service.ts
├─ test
│  ├─ app.e2e-spec.ts
│  └─ jest-e2e.json
├─ tsconfig.build.json
└─ tsconfig.json

```