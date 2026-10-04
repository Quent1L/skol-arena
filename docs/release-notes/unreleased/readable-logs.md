---
type: improved
title: Server logs are now easy to read by default
audience: self-hosters
---
The server now writes its logs as plain, readable lines instead of JSON, so `docker logs` is easy to follow. If a log collector reads your logs, set `LOG_FORMAT` to `json` or `logfmt` to keep the previous format.
