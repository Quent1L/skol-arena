---
type: improved
title: Search ignores accents
---
Typing "eloise" finds "Éloïse" wherever you look for a player: match entry, team picker, match filters, player comparison and the user list.

Self-hosters: the player comparison and the user list search on the server, which needs the PostgreSQL `unaccent` extension. Without it, those two searches still ignore upper and lower case but not accents. Match entry, the team picker and the match filters search in the app itself and ignore accents in every case. See [how to enable `unaccent`](/docs/deployment#accent-insensitive-search-unaccent).
