# Changelog

## [2.0.4](https://github.com/Quent1L/skol-arena/compare/2.0.3...2.0.4) (2026-09-13)

### 🐛 Bug Fixes

* **security:** close the audit findings on scoping, roles and limits ([838cea0](https://github.com/Quent1L/skol-arena/commit/838cea0ee5d258fe05ae204b4f762ca959ef4efc))
* **security:** name the same caller in the logs as in the limits ([1db08ae](https://github.com/Quent1L/skol-arena/commit/1db08ae179415bc9f2e124bcbccfe73f4f099c67))
* **security:** resolve the client address without trusting the caller ([fa9d8f2](https://github.com/Quent1L/skol-arena/commit/fa9d8f2a4624ab047b79c9ef3e696cd6cdcc7015))
* **security:** tell a throttled caller how long to wait, in their locale ([18342f9](https://github.com/Quent1L/skol-arena/commit/18342f92a71158497c734039059f74a0b2d05a14))

## [2.0.3](https://github.com/Quent1L/skol-arena/compare/2.0.2...2.0.3) (2026-09-08)

### 🐛 Bug Fixes

* **ranked:** move a player by the same MMR in a 2v2 as in a 1v1 ([36226c6](https://github.com/Quent1L/skol-arena/commit/36226c645dd629a67997c78bfdbe670583cb277a))

## [2.0.2](https://github.com/Quent1L/skol-arena/compare/2.0.1...2.0.2) (2026-09-04)

### 🐛 Bug Fixes

* **i18n:** translate rank tiers and bracket round names ([2de0d37](https://github.com/Quent1L/skol-arena/commit/2de0d37898fb362d71b201db585d112c568aac50))
* **ranked:** keep tier nameKey when the ladder label is written back ([4617428](https://github.com/Quent1L/skol-arena/commit/46174286d8e1cc70682a820e21b6210b7b3a51bb))

### 🔧 Maintenance

* require bun >= 1.4 for the test isolation flag ([2041253](https://github.com/Quent1L/skol-arena/commit/2041253fe10b8b06615f28c29a1ebb48430dbac2))

## [2.0.1](https://github.com/Quent1L/skol-arena/compare/2.0.0...2.0.1) (2026-08-29)

### 🔧 Maintenance

* **deps:** bump docs astro to 7.2.9, sharp to 0.35 ([b6a0bd3](https://github.com/Quent1L/skol-arena/commit/b6a0bd3b3c80c0512b036c9adf4bea553d646bfc))

## [2.0.0](https://github.com/Quent1L/skol-arena/compare/1.20.2...2.0.0) (2026-08-29)

### ⚠ BREAKING CHANGES

* **rules:** badges already awarded change meaning. They are season
  trophies now, and every existing badge rule becomes `per_season` — a
  rule meant as a one-off has to be set back to `once` by hand. The first
  reconciliation pass after deploy backfills the seasons that were never
  awarded; it is enqueued by the nightly cron at 03:00, or on demand from
  the admin badge reconciliation button, not at startup.
* **stats:** bestTeams, bestDuoPlayers, bestSoloPlayers and
  bestAsymmetricSoloPlayers in the tournament stats payload are now
  boards ({ entries, isLowSample }) instead of arrays. Entries carry a
  weighted `score`, and a team carries its `players` roster.
* **notifications:** GET /me/notifications takes `limit`/`cursor` and
  returns { data, hasMore, nextCursor, unreadCount, total } instead of a
  bare array. FORCE_UPDATE already stands on this branch.
* **mmr:** MMR of ongoing ranked seasons is recalculated on the
  first boot after the update and standings will move. Team matches now
  split the team delta instead of handing it whole to each player, so
  per-match variation in a 2v2 is halved. Finished seasons keep their
  frozen values.
* **tournaments:** the tournament response nests the knobs under
  `scoringConfig` / `championshipConfig`. FORCE_UPDATE ships in this
  commit so old clients are held until they reload.

### ✨ New Features

* **api:** negotiate API major by accept-version header ([5cb6b11](https://github.com/Quent1L/skol-arena/commit/5cb6b11ddaeb541040a1ce346e4d6e3bb5eabd59))
* **backend:** add a bulk match generator script ([68281ea](https://github.com/Quent1L/skol-arena/commit/68281ea2d572ca4fe74ecdd2911f07d9b045f8a1))
* **disciplines:** archive instead of delete, and protect match history ([588bc4d](https://github.com/Quent1L/skol-arena/commit/588bc4db9ecd10afb3b7c29a7444cf7d2e96c6ad))
* **match:** fold post-match contestation into the thread ([853c12f](https://github.com/Quent1L/skol-arena/commit/853c12f85eac9abf81c86611f2f17721846c5800))
* **match:** replace score proposals with a discussion thread ([4f49afc](https://github.com/Quent1L/skol-arena/commit/4f49afc3e74128bfda50bae525fe6cdf9bb4452f))
* **match:** show a skeleton while the match form loads ([626559f](https://github.com/Quent1L/skol-arena/commit/626559f11a0618866fd95146c70f7eed9f1e636b))
* **match:** show the MMR multiplier on ranked outcome types ([f32e415](https://github.com/Quent1L/skol-arena/commit/f32e4154611d53c162a8eb7615657240b5c4a86b))
* **mmr:** split team delta into normalised shares ([a656afe](https://github.com/Quent1L/skol-arena/commit/a656afe0098749f44fc44e81687cc796a15bad2d))
* **ranked:** a player's peak is a career, not a season ([de88c14](https://github.com/Quent1L/skol-arena/commit/de88c14aeac764befdd4140ba63c3fdccc7c2714))
* **ranked:** a season's dates are the ones it really had ([1e7dcd1](https://github.com/Quent1L/skol-arena/commit/1e7dcd18ea1677b80d9ff2c0603e531f2066f785))
* **ranked:** make the match reporting window configurable ([f129749](https://github.com/Quent1L/skol-arena/commit/f1297495363feb351411729928895eb11128efc0))
* **ranked:** show match balance from pre-match MMR ([dbd69cb](https://github.com/Quent1L/skol-arena/commit/dbd69cbe7edd3cff195fa694ffdd6c6051eb9b9e))
* **rules:** condition on how a match ended ([aed85c9](https://github.com/Quent1L/skol-arena/commit/aed85c90912b0a7ab91454fb7d6bbd24a2e4daf0))
* **rulesets:** freeze the discipline a competition is played under ([5135adb](https://github.com/Quent1L/skol-arena/commit/5135adbefee83f09881f626eb0037ec5363bb68c))
* **rules:** explain priority and hide it on badge rules ([60efec9](https://github.com/Quent1L/skol-arena/commit/60efec94953f384029c4e81b5eb88ca0579cbf5f))
* **rules:** make a badge a season trophy, not a lifetime one ([5820a45](https://github.com/Quent1L/skol-arena/commit/5820a453ae164e01ae5a39c01844cf7e00148a88))
* **rules:** record every firing and what became of it ([7c30f4a](https://github.com/Quent1L/skol-arena/commit/7c30f4a2c66e2c538a4019517be5365131bf6e3f))
* **rules:** version stored rules and migrate them forward ([b2f75ff](https://github.com/Quent1L/skol-arena/commit/b2f75ff1857dd4fede4048bd4e0ad704f1c7e20c))
* **stats:** rank cards show roster, links and ranking bar ([0b2a277](https://github.com/Quent1L/skol-arena/commit/0b2a277df7974965b38d85a5e4656bd54f868160))
* **tournament:** make loading and background refresh legible ([694e066](https://github.com/Quent1L/skol-arena/commit/694e066734213caf67c419f9e50ce7a7dbcf6ea9))
* **tournaments:** one editability policy, and enforce status transitions ([93275c5](https://github.com/Quent1L/skol-arena/commit/93275c5ffb1a75c37772584590eb0cef76a31588))

### 🐛 Bug Fixes

* **backend:** warn that a bulk seed run saturates the MMR queue ([b7a7b10](https://github.com/Quent1L/skol-arena/commit/b7a7b10901cacf012a81ca3ecc7ba7a451b17d9d))
* **db:** apply migrations one transaction each ([ce32b7e](https://github.com/Quent1L/skol-arena/commit/ce32b7ef2e2e3c53a24a982f927ab57940dc937c))
* **db:** repair the drizzle-kit snapshot chain ([11f8969](https://github.com/Quent1L/skol-arena/commit/11f8969991ced01c58da8bd5145e602fe64eb7fa))
* **disciplines:** make propagation selectable and tie it to the real edits ([9ecf0bc](https://github.com/Quent1L/skol-arena/commit/9ecf0bc09612f113ec4f5ac10179729067a81920))
* **header:** read the display name from app_users ([3a4123a](https://github.com/Quent1L/skol-arena/commit/3a4123adce25c27a5a962a922186bf7bd8adcb3d))
* **i18n:** fix iOS PWA install instruction wording ([1c7475a](https://github.com/Quent1L/skol-arena/commit/1c7475a2d746f8007c7fd15efc0c0087fad99060))
* **i18n:** label match balance sides A/B ([2942f39](https://github.com/Quent1L/skol-arena/commit/2942f39b2a18df322d7354a3667400ca083efffa))
* **i18n:** translate French leftovers on the player and match screens ([16d595c](https://github.com/Quent1L/skol-arena/commit/16d595cd1fae3d19d5fd98a6fb72936ef0a7ec1a))
* **match:** keep the match form on a single root node ([83f6920](https://github.com/Quent1L/skol-arena/commit/83f6920b3e83e5f6099f4a2c1ccf8eca49f0728e))
* **match:** validate revisions against the stored score ([fca2c6e](https://github.com/Quent1L/skol-arena/commit/fca2c6e7356c5607c00ccdca3c9fade2a7116e38))
* **notifications:** free action notifs once their action is settled ([6308fe6](https://github.com/Quent1L/skol-arena/commit/6308fe6c4764831b30a59ef5081b5ff3c7b2b070))
* **ranked:** keep the rule message on its match event ([dac7bc3](https://github.com/Quent1L/skol-arena/commit/dac7bc3669a84afaa4700f2ab9fbc40b583bbeaf))
* **ranked:** show a profile only to whoever has one ([6a3c5bb](https://github.com/Quent1L/skol-arena/commit/6a3c5bb438a157ad1a2760f69f1bbb8297c4f45e))
* **ranked:** stop locked fields blocking a season update ([affd849](https://github.com/Quent1L/skol-arena/commit/affd849fd72d76b129934e6bdf7469db5ec9cd27))
* **rewind:** keep "Top N" on one line in stat labels ([d60db69](https://github.com/Quent1L/skol-arena/commit/d60db69790b69fad253b26456d020f05be6c9844))
* **rules:** make contains work on string facts ([178f082](https://github.com/Quent1L/skol-arena/commit/178f082aeba6eb8bf699c5a72f5618fadd9035b0))
* **tournament:** redirect to appropriate edit path for ranked tournaments ([2b46b97](https://github.com/Quent1L/skol-arena/commit/2b46b9751e98bdf5f0731093bfe2ca6559889aba))
* **tournament:** stop layout shift on desktop tab switch ([b0bd99b](https://github.com/Quent1L/skol-arena/commit/b0bd99bd92db8603790a05171361cf869f18f835))
* **worker:** drop a job whose subject is gone ([ca95f70](https://github.com/Quent1L/skol-arena/commit/ca95f706afb23a298c117ab5bb90b6b16ae9d80c))

### ⚡ Performance

* **db:** generate row ids as UUID v7 ([64ef7b5](https://github.com/Quent1L/skol-arena/commit/64ef7b5c183d8e3e311ae20b91fde107ebb60309))
* **editor:** dedupe prosemirror copies ([99e42be](https://github.com/Quent1L/skol-arena/commit/99e42be31388eba075e8ce1fab68d149c5a7f4bd))
* **notifications:** drop duplicate boot fetch ([c178441](https://github.com/Quent1L/skol-arena/commit/c17844137422a6c22b9e6897ec614034f102474e))
* **notifications:** paginate the feed, clear it in one request ([8b87e99](https://github.com/Quent1L/skol-arena/commit/8b87e996226783a6723a1972b3a4eeb086fde5b6))

### ♻️ Refactoring

* **mmr:** own the placement rule in the engine ([9790a29](https://github.com/Quent1L/skol-arena/commit/9790a296fa06e8a622cd0a45be47c809c5d0cad1))
* **ranked:** drop the skip from the MMR reveal and recap ([3f649cd](https://github.com/Quent1L/skol-arena/commit/3f649cd2ebcaf90eedd84df4f50bf51ebd0e5b90))
* **tournaments:** extract per-mode config ([0e04c7b](https://github.com/Quent1L/skol-arena/commit/0e04c7b093a2646c10305de65a1376d5b988b8dd))

### 📝 Documentation

* add open source community health files ([b1d3f73](https://github.com/Quent1L/skol-arena/commit/b1d3f736502674b94fb81b1359aa1faaf2c86e25))
* **site:** add a blog and announce going open source ([e5aa62c](https://github.com/Quent1L/skol-arena/commit/e5aa62c5ee76cb3047a8ac103fabece5eacc360d))
* **site:** add a copy button, unstyle code inside blocks ([95adcb7](https://github.com/Quent1L/skol-arena/commit/95adcb75952b5943873b80d355839aaa4693ac99))
* **site:** add SEO metadata, sitemap and llms.txt ([4c80661](https://github.com/Quent1L/skol-arena/commit/4c8066118db581f5cbff348a2774df828450b438))
* **site:** move product reference into the docs site ([4fecaf4](https://github.com/Quent1L/skol-arena/commit/4fecaf48b60abe8e1043c0876038d618751e8544))
* **site:** one-command reset for the screenshot database ([1bcac4f](https://github.com/Quent1L/skol-arena/commit/1bcac4f36ad90daf8d70ae457667c591236377f1))
* **site:** redesign the landing page around real product screenshots ([69f6547](https://github.com/Quent1L/skol-arena/commit/69f6547881d678015738b6b701ed099c50818879))
* **site:** state the two-side match limit and host sizing ([5c7d2eb](https://github.com/Quent1L/skol-arena/commit/5c7d2eb763d4e802e359ce0c8e7f4df7499fcc65))
* **test:** translate French test titles and comments to English ([3319ee0](https://github.com/Quent1L/skol-arena/commit/3319ee06dce02c10e017b449b4d3fd3d4bc8fed4))

### 🔧 Maintenance

* **backend:** cap the test pool at 2 connections ([edfe513](https://github.com/Quent1L/skol-arena/commit/edfe513d307d986898f1176dc7e0ba77869d048d))
* **db:** drop unused contestation_proof column ([1f42617](https://github.com/Quent1L/skol-arena/commit/1f42617e3f4a020d7c99d0b8a06aa00c087ffaee))
* **deps:** minor/patch bumps dependencies across workspaces ([27ba69d](https://github.com/Quent1L/skol-arena/commit/27ba69d7ce76a9801cda41707ff0df1d803deab4))
* **deps:** upgrade release-it to v21 ([d777757](https://github.com/Quent1L/skol-arena/commit/d7777572df80dc96a498e3a4d669ca3a3afcbe2d))
* **docker:** bump bun to 1.4 and patch OS packages on build ([9d1603a](https://github.com/Quent1L/skol-arena/commit/9d1603a672ffab2faed9a0e1318b85f5b388c4db))
* drop stale per-workspace lockfiles ([1c4016b](https://github.com/Quent1L/skol-arena/commit/1c4016b0fcf25c92275e320c22b9a70aef4227f7))
* **hooks:** skip the app suite on docs-only commits ([744db39](https://github.com/Quent1L/skol-arena/commit/744db39840652b9cf257019553e9a8010e98cc26))
* **mmr:** drop the one-shot ranked recalc script ([41a4d7f](https://github.com/Quent1L/skol-arena/commit/41a4d7fc71ae85cc20c381d62b84e3d2194d9836))

### 🎨 Style

* **brand:** rebrand to Skol Arena ([07f2edf](https://github.com/Quent1L/skol-arena/commit/07f2edfa7c62aae066d562490ecb057238eabaf0)), references [#551DC8](https://github.com/Quent1L/skol-arena/issues/551DC8)
* **match:** rebuild the match detail screen ([6595c0f](https://github.com/Quent1L/skol-arena/commit/6595c0f979ab02681683645e3269466ef04a69f7))
* **match:** tidy the mobile scoreboard and ranked profile ([1799cfd](https://github.com/Quent1L/skol-arena/commit/1799cfd74d552f0fa163cb2f75ee2f663b3023d4))
* **ranked:** rework MMR reveal and recap animations ([b880f07](https://github.com/Quent1L/skol-arena/commit/b880f071c28334bc0c5a09d7a6ced1ff7befc766))

## [1.20.2](https://github.com/Quent1L/skol-arena/compare/1.20.1...1.20.2) (2026-08-09)

### 🎨 Style

* **stats:** stack outcome-type card header on mobile ([b957724](https://github.com/Quent1L/skol-arena/commit/b9577240f6a97a1810ddb6b36bcaddd460ef5564))

## [1.20.1](https://github.com/Quent1L/skol-arena/compare/1.20.0...1.20.1) (2026-08-09)

### 🔧 Maintenance

* **docker:** switch base image to bun slim ([2f7c162](https://github.com/Quent1L/skol-arena/commit/2f7c1626ceec0c17c7fe722814742bcacbbefc80))

## [1.20.0](https://github.com/Quent1L/skol-arena/compare/1.19.0...1.20.0) (2026-08-09)

### ✨ New Features

* **home:** rebuild the tournaments hub around the player ([3f35fce](https://github.com/Quent1L/skol-arena/commit/3f35fcef163ff348534d3ddadabeb635e467ad58))
* **ranked:** add end-of-season rewind ([c03de5f](https://github.com/Quent1L/skol-arena/commit/c03de5f4c5a59e7b7c955059de7ef355d01f80ed)), closes [#1](https://github.com/Quent1L/skol-arena/issues/1)
* **ranked:** add peak and average MMR season leaderboards ([0ced6f8](https://github.com/Quent1L/skol-arena/commit/0ced6f89115cbe1a502839788a20e0f9fc662e11))
* **ranked:** fix cross-season MMR carry-over ([566961a](https://github.com/Quent1L/skol-arena/commit/566961aea4b85612b8df9b0a1917b5d9a423c7c9))
* **ranked:** give leaderboard views the stats sub-tab system ([c058d3a](https://github.com/Quent1L/skol-arena/commit/c058d3af91fbc6567284ac40ccf17203f573bb74))
* **ranked:** make mobile stats sub-tabs draggable ([49b52cd](https://github.com/Quent1L/skol-arena/commit/49b52cd6ce42c4b73a179c835e29c700bb8ec990))
* **rewind:** refine deck stats, layout and mobile UX ([c6dd97f](https://github.com/Quent1L/skol-arena/commit/c6dd97f6d6e52df61a50fb80272c00af77353686))
* **stats:** rank leaderboards on competition ranks ([5a14290](https://github.com/Quent1L/skol-arena/commit/5a14290557574d9f3eb1aff4dc730044a0fb2f72))
* **users:** record last activity, not just last login ([9c4e5a2](https://github.com/Quent1L/skol-arena/commit/9c4e5a2d5523b0e1bfa8cad8b52d2b64d8156588))

### 🐛 Bug Fixes

* **auth:** await sign-out before leaving for the login page ([ef37523](https://github.com/Quent1L/skol-arena/commit/ef3752397e5148912350519e5c9cd29d461b1841))
* **auth:** forward refreshed session cookies to the client ([b1c04fe](https://github.com/Quent1L/skol-arena/commit/b1c04fe7acba525debaa0f993b4fd337c47aa2a0))
* **ranked:** persist stats sub-tab in URL ([64b3b33](https://github.com/Quent1L/skol-arena/commit/64b3b337ff48b3699e202ed32fdfa2cd7302c019))
* resolve code review findings on beta ([5bc7dd8](https://github.com/Quent1L/skol-arena/commit/5bc7dd8c8b43d2027101ef1d987f4f43f8160958))
* **router:** add component to empty tournament-detail child route ([8b4a324](https://github.com/Quent1L/skol-arena/commit/8b4a32499b858196045d4651489c37ca23551da8))
* **stats:** stop leaderboard cutoff from counting groups instead of ranks ([e0f166d](https://github.com/Quent1L/skol-arena/commit/e0f166d0ee6293f15c952d0cea9bebdc768d0401))

### 🎨 Style

* **auth:** update text color for better readability ([0a5bfcb](https://github.com/Quent1L/skol-arena/commit/0a5bfcbce64574fb699f308eb3e56c7e221c894e))
* **ranked:** center MMR explainer row icons ([7eff606](https://github.com/Quent1L/skol-arena/commit/7eff606d66613dc4b060cd274bdb76f95a4f5a84))
* **rewind:** add tap-hint label, keep it on screen ([bfa078a](https://github.com/Quent1L/skol-arena/commit/bfa078a05f8bea4790cb251b68bd0d1ec6365c29))
* **stats:** move outcome-type winners/losers toggle onto each card ([57da769](https://github.com/Quent1L/skol-arena/commit/57da7691489caf1394b3ea4f03a2cc28aa464da7))

## [1.19.0](https://github.com/Quent1L/skol-arena/compare/1.18.1...1.19.0) (2026-08-03)

### ✨ New Features

* **pwa:** split forced and background update flows ([0a25421](https://github.com/Quent1L/skol-arena/commit/0a25421562fbc1c7d09e012ac101ffa0d58ffb82))

### 🐛 Bug Fixes

* **comparison:** clear stale results when filters emptied ([e8f874a](https://github.com/Quent1L/skol-arena/commit/e8f874aa7af95abe038537fad8d5aeb4fc432a1b))
* **errors:** stop reporting failures caused by leaving the page ([89b8a5a](https://github.com/Quent1L/skol-arena/commit/89b8a5a399cb9f668dda6b489e6f2801b67b8c23))
* **ranked:** keep rank tier levels contiguous ([589bb44](https://github.com/Quent1L/skol-arena/commit/589bb442275b4215770dae501e05d635bc0a4347))
* **ranked:** refresh weekly MMR movers on match finalization ([1eca138](https://github.com/Quent1L/skol-arena/commit/1eca138596a00f84e00a7131cc2b8c98e1c53cd8))
* **ranked:** revalidate stale caches on tournament remount ([ba2d5e4](https://github.com/Quent1L/skol-arena/commit/ba2d5e421ee0281668d33bc38ea966a6b515e04a))

## [1.18.1](https://github.com/Quent1L/skol-arena/compare/1.18.0...1.18.1) (2026-08-03)

### 🐛 Bug Fixes

* **pwa:** stop the update overlay from looping on slow networks ([d873a35](https://github.com/Quent1L/skol-arena/commit/d873a35975e9cc97984a0be39235b3e6b7b31de6))

## [1.18.0](https://github.com/Quent1L/skol-arena/compare/1.17.0...1.18.0) (2026-08-02)

### ✨ New Features

* **admin:** user management dashboard with archiving ([28412c2](https://github.com/Quent1L/skol-arena/commit/28412c28e0e5a42ffca02441662fc4b85243b49d))
* **player-mmr:** add match-count filter to MMR chart ([0492948](https://github.com/Quent1L/skol-arena/commit/0492948ae197e014d013405d60a5b43b88a485a8))
* **player-stats:** weight best partners and nemeses by match count ([d7e692f](https://github.com/Quent1L/skol-arena/commit/d7e692f7e325094a0b57ef2737dd1e296f62b030))
* **ranked:** add peak MMR and weekly MMR stats ([d7ed63d](https://github.com/Quent1L/skol-arena/commit/d7ed63db192556da777798f8197b27d4ce8bb73c))
* **tournament-stats:** rank outcome types by volume and rate ([9bfdd00](https://github.com/Quent1L/skol-arena/commit/9bfdd0020d89d368e16cab6b149bb2715fd88c2c))

### 🐛 Bug Fixes

* **cache:** flush stale names on player rename ([18b5ed7](https://github.com/Quent1L/skol-arena/commit/18b5ed77d70d80f8b411a98111fd8bf655348c58))
* **email:** surface SMTP failures on admin password reset ([06fc05b](https://github.com/Quent1L/skol-arena/commit/06fc05bf9962e6f8ed336e3930e4bab9c0a05720))
* **notifications:** use the shipped icon for push payloads ([64394c5](https://github.com/Quent1L/skol-arena/commit/64394c52bf92d27577f04a365644dca625846f35))
* **pwa:** precache fonts so icons survive a deploy ([39d00c7](https://github.com/Quent1L/skol-arena/commit/39d00c7fe98514ec1f65bd879eb4bc8258f138e0))

### 🔧 Maintenance

* **deps:** pin typescript to 6.x ([9b2bbf9](https://github.com/Quent1L/skol-arena/commit/9b2bbf9f51d76fab611419f32f724ff93080b53b))
* **frontend:** stop watching generated artifacts in dev ([83df8cc](https://github.com/Quent1L/skol-arena/commit/83df8cc036be66fb0adea0afcfb41600e04afd83))

### 🎨 Style

* **stats:** redesign match outcome distribution layout ([73e7c70](https://github.com/Quent1L/skol-arena/commit/73e7c70216c9da7b56ce7e39700337610741c527))
* **tournament-stats:** collapse streak lists to top 3 ([294b17d](https://github.com/Quent1L/skol-arena/commit/294b17d718042a8662a693f4a48851a75c3f62c2))

## [1.17.0](https://github.com/Quent1L/skol-arena/compare/1.16.0...1.17.0) (2026-07-19)

### ✨ New Features

* **auth:** rotate bootstrap admin password until first login ([d441bb0](https://github.com/Quent1L/skol-arena/commit/d441bb090c6fddac8f3c4fb80473cdea8e016a36))
* **rules:** add player targeting and random gating facts ([48e2fcf](https://github.com/Quent1L/skol-arena/commit/48e2fcfebbf950c151332950131f34dd8a61faaf))

### 🐛 Bug Fixes

* **env:** preset FRONTEND_BUILD_PATH, sync env docs ([7b8b077](https://github.com/Quent1L/skol-arena/commit/7b8b077e8104478ea54408aa3eea55671d7dc5c0))
* **invitations:** look up code by id when deactivating ([93dfa54](https://github.com/Quent1L/skol-arena/commit/93dfa5466dd376e80de709004d5e834b9a6d9ab6))
* **rules:** validate merged rule on partial update ([e5bcf41](https://github.com/Quent1L/skol-arena/commit/e5bcf419cf10eed24336ab1285601a4f7199f685))

### 📝 Documentation

* add Astro showcase site as new workspace package ([9968c73](https://github.com/Quent1L/skol-arena/commit/9968c73db9f2fe89bdbd01b023f8d0d47641b4cd))
* add self-hosting technical docs (env vars, deployment) ([cf5f0ed](https://github.com/Quent1L/skol-arena/commit/cf5f0ed45f78bb5661727b594b4c05ad75828de6))
* add site-wide search with Pagefind ([33bb87d](https://github.com/Quent1L/skol-arena/commit/33bb87db152cfeccd7c29420eed90cb5db2db188))
* **backend:** translate remaining French log messages ([2be4b61](https://github.com/Quent1L/skol-arena/commit/2be4b61500d3827e7a68cab739714544dfc19fe1))
* document organizations and invitation codes ([491eb6b](https://github.com/Quent1L/skol-arena/commit/491eb6b64c8191c07ce2caa25b5baaf062e3ea06))
* document the docs workspace in CLAUDE.md ([f250940](https://github.com/Quent1L/skol-arena/commit/f2509404285c004b3b99f8a785cb8871821746a7))
* redesign showcase site and deepen feature content ([9e15508](https://github.com/Quent1L/skol-arena/commit/9e155087f4c9f6e74852c676df60b9a6fd84127f))
* reposition showcase site around player-first workflow ([5916ead](https://github.com/Quent1L/skol-arena/commit/5916eadd8e87b5c1178ad53d538c41ae2a311deb))

### 🔧 Maintenance

* **deps:** bump dependencies across workspaces ([24ba9fe](https://github.com/Quent1L/skol-arena/commit/24ba9fe7739d365a7c7555bd52452ec479124086))

## [1.16.0](https://github.com/Quent1L/skol-arena/compare/1.15.2...1.16.0) (2026-07-18)

### ✨ New Features

* **match:** add rematch action to match detail ([ea0e334](https://github.com/Quent1L/skol-arena/commit/ea0e334ade37707b5c84a8d8673dc847171d5374))
* **pwa:** apply updates at navigation boundaries ([0b7118f](https://github.com/Quent1L/skol-arena/commit/0b7118fe52842a79953fc1697fd9456b61040361))

### 🐛 Bug Fixes

* **auth:** stop treating network failures as logout ([86ceb0f](https://github.com/Quent1L/skol-arena/commit/86ceb0f89d8406a7613561ba1e4e11b3047f6fe0))
* **notifications:** matchFormat, i18n race, enum casing ([7f23c0b](https://github.com/Quent1L/skol-arena/commit/7f23c0b6a8ae01667091aa8e75937d29b9152952))
* **notifications:** render match date client-side ([3e9f185](https://github.com/Quent1L/skol-arena/commit/3e9f185728af806968a2e9168d4bb72033df477d))
* **ranked:** fix MMR recalc divergence and close finalize/delete/update integrity gaps ([f0cd897](https://github.com/Quent1L/skol-arena/commit/f0cd8974be3fa0edc1adec45520750427e2d0970))
* **ui:** report unreachable server without blaming the user ([c724c34](https://github.com/Quent1L/skol-arena/commit/c724c34a6d2e17f3d16514008abac5c5b17e25a9))

### ⚡ Performance

* **auth:** cache session in cookie for 5 minutes ([84d747a](https://github.com/Quent1L/skol-arena/commit/84d747a5f945bbd037f42605eb6328b1a71707c5))

### 📝 Documentation

* require --isolate for backend tests ([8f4ba03](https://github.com/Quent1L/skol-arena/commit/8f4ba030f02c0b53edea940fdebd1ba190266c68))
* translate French comments to English ([d60ce33](https://github.com/Quent1L/skol-arena/commit/d60ce339bc231813099b699337464a6b73e4b17f))

### 🔧 Maintenance

* ignore dev-dist and local Claude Code settings ([5b5b0c9](https://github.com/Quent1L/skol-arena/commit/5b5b0c9a8cc3f252bc4cba82c5a9b523349edfcf))

## [1.15.2](https://github.com/Quent1L/skol-arena/compare/1.15.1...1.15.2) (2026-07-02)

### 🐛 Bug Fixes

* **match:** sync /validate rule checks with match creation ([e6ffdfc](https://github.com/Quent1L/skol-arena/commit/e6ffdfca0fccae62c9fad8b9b72aeb64f4110602))
* **stats:** hide outcome-type UI when discipline has none ([b83108c](https://github.com/Quent1L/skol-arena/commit/b83108c0e120e66371f59c3bf7448e9a978df078))

## [1.15.1](https://github.com/Quent1L/skol-arena/compare/1.15.0...1.15.1) (2026-07-01)

## [1.15.0](https://skol-arena/Quent1L/skol-arena/compare/1.14.2...1.15.0) (2026-06-29)

### ✨ New Features

* **discipline:** add icon picker and display in tournament card ([368a3ac](https://skol-arena/Quent1L/skol-arena/commit/368a3ac5899c438174856af189cd6cc0c84bafc6))
* **ranked:** custom FA icon per rank tier ([f15daf0](https://skol-arena/Quent1L/skol-arena/commit/f15daf00a2a6c9733837ae5e9d4283d363111664))

### 🐛 Bug Fixes

* **ranked:** batch recalc recap, deliver as one grouped card ([64d2b7e](https://skol-arena/Quent1L/skol-arena/commit/64d2b7ec2ae91bcd6cdc6b679155703dbadaa23f))
* **ranked:** notify recalculated matches, stop phantom recap ([b46a3e6](https://skol-arena/Quent1L/skol-arena/commit/b46a3e6b0f086b73549133ec98e024d789006f12))
* **ranked:** refresh leaderboard after match save ([9b82efa](https://skol-arena/Quent1L/skol-arena/commit/9b82efa950bbba18fc601feac4802edea86b478f))
* **ranked:** show recalc differential in MMR recap, not full deltas ([9c33484](https://skol-arena/Quent1L/skol-arena/commit/9c334840ff15005c1ddca2ecd862d5245892e9ed))
* **ranked:** support draw matches end-to-end ([fbdeef9](https://skol-arena/Quent1L/skol-arena/commit/fbdeef958bbd1518df9f7d7204d0251919f9a003))

## [1.14.2](https://skol-arena/Quent1L/skol-arena/compare/1.14.1...1.14.2) (2026-06-28)

### 🐛 Bug Fixes

* **tournament:** show badges tab on mobile ([9230db5](https://skol-arena/Quent1L/skol-arena/commit/9230db5d571382bf61a3716001ca90091fe97559))

### 🔧 Maintenance

* **icon:** update fa-icons JSON ([89f7726](https://skol-arena/Quent1L/skol-arena/commit/89f77265dde5b55b3df83f362eba5f9e36b039dc))

## [1.14.1](https://skol-arena/Quent1L/skol-arena/compare/1.14.0...1.14.1) (2026-06-28)

### 🐛 Bug Fixes

* **ranked:** fix stats grid layout on mobile for long FR labels ([090c6da](https://skol-arena/Quent1L/skol-arena/commit/090c6dafbf436f4c656c3ee728a5a6e970857a54))

## [1.14.0](https://skol-arena/Quent1L/skol-arena/compare/1.13.1...1.14.0) (2026-06-28)

### ✨ New Features

* **admin:** add Beta tag and warning to rules engine pages ([1aa6ed1](https://skol-arena/Quent1L/skol-arena/commit/1aa6ed1a24e98c39bfdd355ce62c6d1b4dc05afe))
* **badges:** dedicated tab with earned/unearned distinction + square cards ([ff158af](https://skol-arena/Quent1L/skol-arena/commit/ff158af5c025068a0021fa26a40da2982bfb25a0))
* **comparison:** add player comparison view with discipline/tournament scope ([8473139](https://skol-arena/Quent1L/skol-arena/commit/8473139f0038400811f96422df903ac03e51c4d5))
* **i18n:** add i18n frontend setup ([ee2abe7](https://skol-arena/Quent1L/skol-arena/commit/ee2abe710cb87524bfdc55a46c82be3da46c83cd))
* **i18n:** migrate all frontend strings to vue-i18n ([e68af05](https://skol-arena/Quent1L/skol-arena/commit/e68af052296c32700f1cdd1828c350cd15f3d901))
* **player:** extract shared StatsFiltersBar component ([ee36c65](https://skol-arena/Quent1L/skol-arena/commit/ee36c658f3949264ed5d29ce07d13e1a652ed7b9))
* **ranked:** expose lossStreak in leaderboard, player profile and global stats ([30955a0](https://skol-arena/Quent1L/skol-arena/commit/30955a027e81b1dabed80867478742e1f20d1cb4))
* **rules-engine:** add contextual message & badge system ([0ac226f](https://skol-arena/Quent1L/skol-arena/commit/0ac226f71289965b7913daaf0d160068c1ae5c1a))
* **rules:** badge lifecycle — recalc, revocation, nightly reconcile ([9cce1b3](https://skol-arena/Quent1L/skol-arena/commit/9cce1b3903ad878221310b9e5b7614d51381a740))
* **rules:** enrich condition builder with typed pickers ([b26000e](https://skol-arena/Quent1L/skol-arena/commit/b26000edf00e6334f93b29e74bb4abeabb313593))

### 🐛 Bug Fixes

* **deps:** bump better-auth to 1.6.22 ([a43cfa4](https://skol-arena/Quent1L/skol-arena/commit/a43cfa4ffa1401bd68c56d048d1bc5734367eaf7))
* **i18n:** escape @ in email placeholders ([3adeb09](https://skol-arena/Quent1L/skol-arena/commit/3adeb09c7615178c2404a182e43a17c06660a634))
* **ranked:** use real tier range for LP progress bar ([447d91b](https://skol-arena/Quent1L/skol-arena/commit/447d91b49878fad402b3c12cf901d609d4956b4b))
* **rules:** restore DatePicker value on condition edit ([41147c8](https://skol-arena/Quent1L/skol-arena/commit/41147c8f17f161d109a8e24072a26db668d16be6))

### ⚡ Performance

* **frontend:** slim Font Awesome metadata for icon picker ([f41e1a1](https://skol-arena/Quent1L/skol-arena/commit/f41e1a1a0d6382faa351c852ce963dc9c1f583a9))

### 📝 Documentation

* **changelog:** translate to English + backfill pre-1.9.0 history ([c9126f7](https://skol-arena/Quent1L/skol-arena/commit/c9126f7618706ac3b84b9f251a49a73e9696d8df))
* translate README to English and align with current stack ([bef0846](https://skol-arena/Quent1L/skol-arena/commit/bef0846f298accc3a497b2dd6a433bbd9df60e20))

### 🔧 Maintenance

* **frontend:** update dependencies ([4676b80](https://skol-arena/Quent1L/skol-arena/commit/4676b80b77eea1e4408fe5261bddf6b967594ead))
* rename skill-arena to skol-arena ([c74dc1c](https://skol-arena/Quent1L/skol-arena/commit/c74dc1ca6a6a433d448d7b120b48624f4280205f))

### 🎨 Style

* **admin:** improve breadcrumb ([96a357d](https://skol-arena/Quent1L/skol-arena/commit/96a357d02628b7669ad2f1fc4c550108c56cab0a))

## [1.13.1](https://github.com/Quent1L/skol-arena/compare/1.13.0...1.13.1) (2026-06-22)

### 🐛 Bug Fixes

* **ranked:** embed chart series in player MMR endpoint ([d56732b](https://github.com/Quent1L/skol-arena/commit/d56732bd4067cad11945c1c635deedb3d7584dec))

## [1.13.0](https://github.com/Quent1L/skol-arena/compare/1.12.2...1.13.0) (2026-06-15)

### ✨ New Features

* **ranked:** enrich outcome distribution with W/D/L breakdown ([657281d](https://github.com/Quent1L/skol-arena/commit/657281d23dd24197feb92d7d9b6a82d6443a2996))
* **ui:** unify info tooltip pattern with mobile support ([16499f6](https://github.com/Quent1L/skol-arena/commit/16499f6105c27f5450deb0e96dbf7fd0a254fbd0))

### 🐛 Bug Fixes

* **ranked:** remove ghost playerMmr rows after match cancellation ([26b8ce7](https://github.com/Quent1L/skol-arena/commit/26b8ce7b3ce5cb0eb23b971ef4f6f1e64c95507e))

## [1.12.2](https://github.com/Quent1L/skol-arena/compare/1.12.1...1.12.2) (2026-06-08)

### 🐛 Bug Fixes

* **ranked:** disable swipe to provisional when showModeToggle is false ([4a32502](https://github.com/Quent1L/skol-arena/commit/4a32502f159e544b34018282f91e9504870eb26f))
* **ranked:** fix provisional leaderboard streak/order divergence ([1faae3a](https://github.com/Quent1L/skol-arena/commit/1faae3a53df36bea1189f5eab26024a2983e6f08))

## [1.12.1](https://github.com/Quent1L/skol-arena/compare/1.12.0...1.12.1) (2026-06-07)

### 🐛 Bug Fixes

* **ranked:** show all outcome types regardless of match count ([41dc149](https://github.com/Quent1L/skol-arena/commit/41dc149742ce687a6850fb556f13268f265c496e))

### ♻️ Refactoring

* **stats:** replace doughnut chart with MatchOutcomeDistribution ([57d15bb](https://github.com/Quent1L/skol-arena/commit/57d15bb3e639de9249b4d5c7dbe1b8673e989f1b))

## [1.12.0](https://github.com/Quent1L/skol-arena/compare/1.11.1...1.12.0) (2026-06-05)

### ✨ New Features

* **ranked:** add outcome distribution to player MMR profile ([ae55f2d](https://github.com/Quent1L/skol-arena/commit/ae55f2d2661f3a5069df69a8dc0b5dc3edd21872))

### 🐛 Bug Fixes

* **match:** drag-and-drop crashes on mobile when long-press ([f58a5f7](https://github.com/Quent1L/skol-arena/commit/f58a5f7d9d712cfd1b67692a2a4f8474983e1184))
* **player:** carry tournamentId in players stats link ([14d14d3](https://github.com/Quent1L/skol-arena/commit/14d14d340ac171a0eeba5703768d3c38bb2810fe))
* **ranked:** reload animation queue on mobile reconnect ([2816645](https://github.com/Quent1L/skol-arena/commit/2816645f512cdb508cbee07dec8caab5e061d6a7))
* **router:** redirect authenticated users away from /login ([d1008b1](https://github.com/Quent1L/skol-arena/commit/d1008b1346bdf99173fa34a32511a7024b84bd90))

### 🔧 Maintenance

* **deps:** bump all dependencies across workspaces ([4cfe50d](https://github.com/Quent1L/skol-arena/commit/4cfe50d58ff959eefa07e0fcac52ceb95319a28a))

## [1.11.1](https://github.com/Quent1L/skol-arena/compare/1.11.0...1.11.1) (2026-05-31)

### 🐛 Bug Fixes

* **player:** replace v-tooltip with Popover on RecentFormSection info icon ([a08cfc4](https://github.com/Quent1L/skol-arena/commit/a08cfc4023f8472d38eefa5cf71d3517f0c5dc4a))
* **ranked:** prevent winStreak/recentResults mismatch on leaderboard ([2c96bfb](https://github.com/Quent1L/skol-arena/commit/2c96bfb8ffdebe1ba966b8f225bb4c42a5d53f44))

## [1.11.0](https://github.com/Quent1L/skol-arena/compare/1.10.0...1.11.0) (2026-05-31)

### ✨ New Features

* **ux:** suppress non-error toasts on mobile ([0b9cc4d](https://github.com/Quent1L/skol-arena/commit/0b9cc4d6d494b444200b2b0199376dc2d9b3f24d))

### 🐛 Bug Fixes

* **pwa:** make dismiss button reactively hide install banner ([ff46cb0](https://github.com/Quent1L/skol-arena/commit/ff46cb00a7f3a069a94271e96af46258e29e9073))
* **ranked:** prevent no-MMR flash while player profile loads ([96ee980](https://github.com/Quent1L/skol-arena/commit/96ee98006bc35f33e3a4f43edf8b1996e2a403))

### 🔧 Maintenance

* **docker:** cache bun install packages between builds ([5887c51](https://github.com/Quent1L/skol-arena/commit/5887c51cb7fe286962bde10f7b3a35b6741678dd))
* **release:** prevent release-it from bumping package.json ([7d70bc1](https://github.com/Quent1L/skol-arena/commit/7d70bc16632c6fbe7f7d18fcc3a9ce3582e3252a))

## [1.10.0](https://github.com/Quent1L/skol-arena/compare/1.9.0...1.10.0) (2026-05-31)

### ✨ New Features

* **stats:** add 5 new player stat sections ([2382d4b](https://github.com/Quent1L/skol-arena/commit/2382d4bdff675997b2b57637d1a5dc106493f2c8))
* **tournament:** refresh data on WS reconnect and leaderboard update ([1500ae8](https://github.com/Quent1L/skol-arena/commit/1500ae89bffb8dbef649db2d790fc32db3958681))
* **ux:** show update overlay before SW-triggered reload ([1a7a967](https://github.com/Quent1L/skol-arena/commit/1a7a96791a44aaf2037fe26bff25d785e6fca459))

### 🐛 Bug Fixes

* **mobile:** load player profile on stats tab refresh ([5289efe](https://github.com/Quent1L/skol-arena/commit/5289efe7cfabc6d4b9b8919636fe76949db27b86))

### ⚡ Performance

* **player-stats:** cache per-tournament stats in player_computed_data ([4e7eb2c](https://github.com/Quent1L/skol-arena/commit/4e7eb2c0508d559fd1bef40e7aa0d2c343e9fa9a))

### ♻️ Refactoring

* extract helpers and dedupe across stats/match logic ([29e5d28](https://github.com/Quent1L/skol-arena/commit/29e5d283d5cceb79faa2edb0a83044c52c8f6838))
* **player:** extract stat sections + add discipline filter ([1505ba6](https://github.com/Quent1L/skol-arena/commit/1505ba68cb290b000343d9a9278bae538d3b3322))

### 🎨 Style

* **stats:** modify grid of filter on PlayerStat ([fc7251d](https://github.com/Quent1L/skol-arena/commit/fc7251dfb435a2bb9b7fd78e4d6395619615ded4))

## [1.9.0](https://github.com/Quent1L/skol-arena/compare/1.8.1...1.9.0) (2026-05-26)

### ✨ New Features

* **mobile:** add clearable search in PlayerPickerDialog ([fea6072](https://github.com/Quent1L/skol-arena/commit/fea6072df8da205bc7443a2c78e20d614c766a50))
* **stats:** add solo & asymmetric solo player rankings ([510f3fd](https://github.com/Quent1L/skol-arena/commit/510f3fdc173f0e0651f5b64f7a2f0b91304ef325))
* **tournament:** add admin cache-clear action ([2b569ef](https://github.com/Quent1L/skol-arena/commit/2b569eff9160f93676e2e53fc65b484c9cb7c0cb))

### 🐛 Bug Fixes

* **mobile:** link players stats into RankedLeaderboard ([f77e3a2](https://github.com/Quent1L/skol-arena/commit/f77e3a2bf82e0867e0da1e1b670fdc695ce40ed0))

### 🔧 Maintenance

* add release-it ([716f132](https://github.com/Quent1L/skol-arena/commit/716f132386e2c8bd3ff6a4d9fb6e0e2a071006b8))

## [1.8.1](https://github.com/Quent1L/skol-arena/compare/1.8.0...1.8.1) (2026-05-24)

### 🎨 Style

* **frontend:** make MatchList grid layout and scroll configurable ([b6cfa55](https://github.com/Quent1L/skol-arena/commit/b6cfa552c808d975b99912eb03ecba563afc706c))

## [1.8.0](https://github.com/Quent1L/skol-arena/compare/1.7.0...1.8.0) (2026-05-24)

### ✨ New Features

* **match:** add MATCH_POST_DISPUTE notification and expose creator ([0fbc150](https://github.com/Quent1L/skol-arena/commit/0fbc1509343fe5252cdb21455d9ebacb5d7094cd))
* **mobile:** add swipe gesture with slide animation to ranked stats sub-tabs ([9c59fa7](https://github.com/Quent1L/skol-arena/commit/9c59fa7d4629d6540b8f9102d882f4785f4bad46))

## [1.7.0](https://github.com/Quent1L/skol-arena/compare/1.6.2...1.7.0) (2026-05-24)

### ✨ New Features

* **AppHeader:** show back-chevron on mobile tournament detail ([12ebbeb](https://github.com/Quent1L/skol-arena/commit/12ebbeba09fd5b174de3c4ebf7f58b2f080ac615))
* **disciplines:** add team_interaction_mode enum field ([7e29941](https://github.com/Quent1L/skol-arena/commit/7e299411a4a688e6ecd2a0a34279347775353da8))
* **match:** add allPlayerIds validation path + debounced live validation ([70a8d27](https://github.com/Quent1L/skol-arena/commit/70a8d270f5cec05e9596aa086bb6a27fc9056960))
* **match:** add "none" validation mode with immediate finalization ([2d0b46d](https://github.com/Quent1L/skol-arena/commit/2d0b46daf5fe18112c9c19af6e9b2e5709be2af7))
* **match:** add configurable validation mode and trust score ([389789a](https://github.com/Quent1L/skol-arena/commit/389789ae9c9d669ebe7e3d4b46eb469a0e12c33f))
* **match:** add PlayerAvatar to match detail + mobile layout ([1dc5b38](https://github.com/Quent1L/skol-arena/commit/1dc5b380edc8613a314011d61db8063806b7b21d))
* **match:** lock bracket match player steps ([bc8671f](https://github.com/Quent1L/skol-arena/commit/bc8671f9eb000460496fa543ed1271da379caf34))
* **match:** unified respond endpoint + post-finalization disputes ([2041eec](https://github.com/Quent1L/skol-arena/commit/2041eeccea42d11eb0fa012559f9ea89a8e461c6))
* **mmr:** wire match scores into K-factor calculation ([8def8b5](https://github.com/Quent1L/skol-arena/commit/8def8b5c9bb11caf0b736bc248c50c8f375316ea))
* **mobile:** add floating create-match button to bottom nav ([6aed15c](https://github.com/Quent1L/skol-arena/commit/6aed15c6055eeadf966de7626863a1ba9283a63c))
* **outcome-type:** add mmrMultiplier field for per-outcome MMR scaling ([436d537](https://github.com/Quent1L/skol-arena/commit/436d5376b02bbb32a5e51c8fae80262eda5bb4e2))
* **player:** add mode tag in tournament select + ranked filter ([7b56dc6](https://github.com/Quent1L/skol-arena/commit/7b56dc6f926f16f272b144f901110ae9b1bd2106))
* **player:** disable infinite scroll in player profile MatchList ([5bcbba2](https://github.com/Quent1L/skol-arena/commit/5bcbba25f4c775d3d5c951c54ac79bef30df4983))
* **player:** redesign profile view + add partner/nemesis panels ([d3c967c](https://github.com/Quent1L/skol-arena/commit/d3c967cca266ff67c2f431b7b6fe17c1728dd2c2))
* **ranked:** add encouragement messages for MMR events ([3ffcb21](https://github.com/Quent1L/skol-arena/commit/3ffcb2120ecf824f5cd8b30c35b17b3fc2805e4e))
* **ranked:** add MMR explainer card and improve season form validation ([a0c1078](https://github.com/Quent1L/skol-arena/commit/a0c1078b827dcfbd1711037fb324dd3ea561b8bd))
* **ranked:** cascade MMR recalculation on match cancellation ([94160c6](https://github.com/Quent1L/skol-arena/commit/94160c66f0525db712ee93a1eab4eacb79def499))
* **ranked:** improve MmrReveal UX + extract tier-style utils ([e387e7d](https://github.com/Quent1L/skol-arena/commit/e387e7d8543573a90469ee533e3a0b32c62260bf))
* **ranked:** offload MMR recalculation to async job queue ([d61f5d7](https://github.com/Quent1L/skol-arena/commit/d61f5d7e1f4e992659371441ab67699eda498dd6))
* **ranked:** surface MMR recalculations in match recap card ([18f185c](https://github.com/Quent1L/skol-arena/commit/18f185c8382d7487afed44ee12cc5707020e710a))
* **ranked:** team-aware MMR distribution per teamInteractionMode ([b1f8728](https://github.com/Quent1L/skol-arena/commit/b1f8728539201e5427ba7f17a2e26a6dfe64acfd))

### 🐛 Bug Fixes

* **auth:** replace forgetPassword by requestPasswordReset ([3298863](https://github.com/Quent1L/skol-arena/commit/32988633ab076c3299eab0b482ef9d34eaecbf5d))
* **perf:** prevent RAM growth in auto-finalize batch job ([37f7e3b](https://github.com/Quent1L/skol-arena/commit/37f7e3bd9c688381bce1d848c3c81210f5847641))
* **ranked:** sort MMR recap events by match date instead of creation date ([3b82a3c](https://github.com/Quent1L/skol-arena/commit/3b82a3c7dfb5c19048d278280d95c3b44f761174))
* **serviceWorker:** improve service worker update handling and prevent double reloads ([c242475](https://github.com/Quent1L/skol-arena/commit/c2424759981e310e51142f7ced6b81c5c90ea4fb))

### ⚡ Performance

* **ranked:** optimize MMR recalculation with incremental replay ([0a07f1b](https://github.com/Quent1L/skol-arena/commit/0a07f1b21250d2737dcbb6de564a1913c0146984))

### ♻️ Refactoring

* **forms:** extract shared season/tournament form schema ([c21685a](https://github.com/Quent1L/skol-arena/commit/c21685a2a8057b3c26a9614dfaf60cdad99b9919))
* **jobs:** replace setInterval scheduler with Bun.cron + pg advisory lock ([a00fd9b](https://github.com/Quent1L/skol-arena/commit/a00fd9b430fa0cb2bba5a771fc197b128f70104f))
* **match:** replace A/B side model with position-based sides ([c58e03c](https://github.com/Quent1L/skol-arena/commit/c58e03c5cd86246c1d884c787b5176ab11b12647))
* **match:** split service into notification + finalization helpers ([4b592bc](https://github.com/Quent1L/skol-arena/commit/4b592bcf970dbca79c811a66ee84aa7f57f61c92))
* **services:** split oversized functions and clear SonarLint smells ([7d55a10](https://github.com/Quent1L/skol-arena/commit/7d55a10c17624ae168123c7b4060679d2b09beac))
* **tournament:** merge profile tab into Stats tab ([d928300](https://github.com/Quent1L/skol-arena/commit/d928300f8757b76d871aa605624adfe7d9111b0b))

## [1.6.2](https://github.com/Quent1L/skol-arena/compare/1.6.1...1.6.2) (2026-05-07)

### ♻️ Refactoring

* improve database pooling, optimize server startup, and refactor match service ([0b31fad](https://github.com/Quent1L/skol-arena/commit/0b31fad492f945d8ee638f9f21c6ce57a74b130a))

## [1.6.1](https://github.com/Quent1L/skol-arena/compare/1.6.0...1.6.1) (2026-05-05)

### 🐛 Bug Fixes

* **match:** allow participants to update their own scheduled matches ([2201e39](https://github.com/Quent1L/skol-arena/commit/2201e393b42b51fd14c1ad7c3e98260184ae2282))

## [1.6.0](https://github.com/Quent1L/skol-arena/compare/1.5.1...1.6.0) (2026-05-04)

### ✨ New Features

* add organization feature ([a9f7684](https://github.com/Quent1L/skol-arena/commit/a9f7684c64084af1a10cc56cd9821e40e02f49fd))
* add PlayerAvatar + rework BracketMatchCard layout ([d25dd99](https://github.com/Quent1L/skol-arena/commit/d25dd9909e0c8c23da843b589e734d2c4f5cdae2))
* add sub rank for ranked ([0e2c15e](https://github.com/Quent1L/skol-arena/commit/0e2c15e9065155cc3f117fb89f15e8af1b94224e))
* **bracket:** replace CSS layout with canvas + SVG connectors ([9aac63e](https://github.com/Quent1L/skol-arena/commit/9aac63e2ec55d7b4a36b360da2a3b6caa8809dd8))
* **match:** auto-confirm admin update when updater is participant ([6c5e66f](https://github.com/Quent1L/skol-arena/commit/6c5e66fb20f012978eaea0dbfb84e6bfec7d7187))
* **match:** prevent double-booking players at the same time slot ([b5c3d2d](https://github.com/Quent1L/skol-arena/commit/b5c3d2dec213f065feb53dbe436a3cec611b69b8))
* **match:** scope points to championship; show MMR delta for ranked ([2f435ba](https://github.com/Quent1L/skol-arena/commit/2f435ba5a89b8507c4b62b2aa577f9e0d7eae6d8))
* **mmr:** scale K factor by outcome type points ([8ec3c8f](https://github.com/Quent1L/skol-arena/commit/8ec3c8fde9da5ede91cee950476834ef1095f1bf))
* **ranked:** add MMR animation event system ([90d1d4b](https://github.com/Quent1L/skol-arena/commit/90d1d4ba299eae6dea32b3c152ea914d860eb46e))
* **ranked:** add provisional leaderboard + redesign leaderboard UI ([4abbdb4](https://github.com/Quent1L/skol-arena/commit/4abbdb41dd621912dd7db5b3746fe064f68f7d7d))
* **ranked:** LP display + MMR symmetry fix ([2f5dba9](https://github.com/Quent1L/skol-arena/commit/2f5dba918aefc6a009c4565fdcab4ed6279238e2))
* **user:** enforce display name format via shared regex ([8bf098e](https://github.com/Quent1L/skol-arena/commit/8bf098efd0cb5eaf14433479d4030464a10b81f5))

### 🐛 Bug Fixes

* fix: remove duplicate text + standings help tooltip ([1e4c6d6](https://github.com/Quent1L/skol-arena/commit/1e4c6d68d28d716331dc67e752e42c19233c87d5))
* **dates:** use local timezone when serializing/parsing date-only fields ([a00287a](https://github.com/Quent1L/skol-arena/commit/a00287ac0e545ef9bf2f78dbd1b9ec1515e1bbf6))
* **match:** forward playedAt to repository on create and update ([53c23da](https://github.com/Quent1L/skol-arena/commit/53c23da6f358fc30cba5ec08fcf75d40b7452708))
* **tournament:** invalidate stats cache on match finalization + surface stats error in UI ([14ea0fa](https://github.com/Quent1L/skol-arena/commit/14ea0fa92b9c5cbd0a1b3f492ff47b2022a0d6b7))
* **ui:** swap Avatar for PlayerAvatar in PlayerPickerDialog ([970cb05](https://github.com/Quent1L/skol-arena/commit/970cb057fa48339c5d35cce5c3fd8eb1c038d3b5))

### ♻️ Refactoring

* **match:** lean GET /matches/:id response using sides[] ([b63a182](https://github.com/Quent1L/skol-arena/commit/b63a182c850e9cfdfbcbd2cb1c1f63f4b99a2a7b))
* **standings:** remove BP/BC columns, use CSS for mobile visibility ([c55813b](https://github.com/Quent1L/skol-arena/commit/c55813bbd9552ebbf5de6488ec72b3728329a5b2))
* **tournament:** centralize overflow menu into store and component ([4fa52a8](https://github.com/Quent1L/skol-arena/commit/4fa52a83c150ba5b2c5253bd68249f316b1c4af8))

## [1.5.1](https://github.com/Quent1L/skol-arena/compare/1.5.0...1.5.1) (2026-04-19)

### 🐛 Bug Fixes

* avatar style in match card ([953aaae](https://github.com/Quent1L/skol-arena/commit/953aaae3f675314c949c8db36e1b4afdfdc7a258))
* hide effectivePointsAwarded for ranked match ([1fd0ee7](https://github.com/Quent1L/skol-arena/commit/1fd0ee7d0a53a14eccef4782981c2c3af8b5c994))
* z-index SpeedDial create match ([9b3830b](https://github.com/Quent1L/skol-arena/commit/9b3830b1fdc78761045aaa0d57d433ac9553761f))

### ♻️ Refactoring

* info tab of tournaments ([a80deb4](https://github.com/Quent1L/skol-arena/commit/a80deb49aaf7dcf47d37ff8696d008ba746e0ecb))

## [1.5.0](https://github.com/Quent1L/skol-arena/compare/1.4.1...1.5.0) (2026-04-19)

### ✨ New Features

* add match filters ([372bd29](https://github.com/Quent1L/skol-arena/commit/372bd2915f9e9dc0e11d2820e9608e0e03731fa8))
* add match history ([9872f98](https://github.com/Quent1L/skol-arena/commit/9872f9859b5eafd489f2bb48d2778fd121300b0a))
* add points on match card ([3059117](https://github.com/Quent1L/skol-arena/commit/3059117816054ef9592e6014106b16d704013ae9))
* add ranked mode with score config + participant join ([5cea3d9](https://github.com/Quent1L/skol-arena/commit/5cea3d9e644e12940747fed45f415ccffa042170))
* add victoryQuality by points tiebreak for outcome type ([e2e7b80](https://github.com/Quent1L/skol-arena/commit/e2e7b806b97ea49218330e8403a34cab384d1285))
* change MobileBottomNav ([9dccd4d](https://github.com/Quent1L/skol-arena/commit/9dccd4d1ecb32b90b68187036943be53cf21fc1b))
* enhance mobile navigation ([27800cf](https://github.com/Quent1L/skol-arena/commit/27800cfd8007fa84737ac6bf6f3e4105be0d4a99))
* enhance tournaments stats and surface style ([604c5a0](https://github.com/Quent1L/skol-arena/commit/604c5a077988bad3b4a22c781034d108676b39b2))
* optimize matches routes ([132c93b](https://github.com/Quent1L/skol-arena/commit/132c93be4f8b08d4e5ae5e5bdbe7f226b70d0a08))
* refactor rank tier + layout ranked ([20ea701](https://github.com/Quent1L/skol-arena/commit/20ea70100c1771b2b20479134b3d6ef22fd8ac4a))
* redesign tournament/ranked UI ([ce300f8](https://github.com/Quent1L/skol-arena/commit/ce300f81a0f415fdcfd00b0694f211eab2019cd8))
* review calculate standings ([9af38d8](https://github.com/Quent1L/skol-arena/commit/9af38d8d550539ebf50e22f7af86d4a298a69be7))
* store stats in computed_data instead of calculating on the fly ([6cdbc42](https://github.com/Quent1L/skol-arena/commit/6cdbc425228e2bbdc679ba2f15a5a3bcda8ceb4b))
* add individual points for performance ([387144a](https://github.com/Quent1L/skol-arena/commit/387144a7b61ad46f7ac30c705da23cabdf18eda0))
* add tournament context for player link ([c9c91e3](https://github.com/Quent1L/skol-arena/commit/c9c91e3bce9e507c9cfb6eb5946c499e1b6e8275))

### 🐛 Bug Fixes

* Buchholz sum in standings ([7e090bf](https://github.com/Quent1L/skol-arena/commit/7e090bfd59e14210bfd762b37ea6b84473ba45e3))

### ♻️ Refactoring

* matchList with PlayerMatchHistory ([7cb1d90](https://github.com/Quent1L/skol-arena/commit/7cb1d9046911436f8dbbcd3c177b41ecf522e8c9))

### 🎨 Style

* change match detail surface ([ef84575](https://github.com/Quent1L/skol-arena/commit/ef84575eb7334cf06c43be0678eea47a6b639cba))

## [1.4.1](https://github.com/Quent1L/skol-arena/compare/1.4.0...1.4.1) (2026-04-12)

### 🐛 Bug Fixes

* resize mobile detection ([9aaec9d](https://github.com/Quent1L/skol-arena/commit/9aaec9d9906225202e0cb7f042f1c7321c36e44b))

## [1.4.0](https://github.com/Quent1L/skol-arena/compare/1.3.1...1.4.0) (2026-04-12)

### ✨ New Features

* add multiple participant management for admin ([d8bbb2b](https://github.com/Quent1L/skol-arena/commit/d8bbb2b46c18e77df6eac1229507a4045daf872c))

### 🐛 Bug Fixes

* bracket generation from standings ([7701b19](https://github.com/Quent1L/skol-arena/commit/7701b19ad2b7f67d028451fb5de3cc7f49ebe110))
* touch device detection ([ea49bde](https://github.com/Quent1L/skol-arena/commit/ea49bde21309fd55aa66fabc453a26a105fbb784))

## [1.3.1](https://github.com/Quent1L/skol-arena/compare/1.3.0...1.3.1) (2026-04-09)

### 🐛 Bug Fixes

* add kiosk migration into journal.json ([9f97e1e](https://github.com/Quent1L/skol-arena/commit/9f97e1e8d11be13d291f4e41307b394de7c178d7))

## [1.3.0](https://github.com/Quent1L/skol-arena/compare/1.2.0...1.3.0) (2026-04-08)

### ✨ New Features

* add kiosk user ([f8ab199](https://github.com/Quent1L/skol-arena/commit/f8ab19975f03ac7fe2bb7e1ffe5f236619d68b5f))
* add setting lock for kiosk user ([653c491](https://github.com/Quent1L/skol-arena/commit/653c49161de1bd95503f78835f3b940461373b6a))
* add touch device detection for mobile layout ([b53c260](https://github.com/Quent1L/skol-arena/commit/b53c260b72b0446045b74ceabfc008af6f9f5908))
* added gesture redirection to native auth for PWA ([d0d9d56](https://github.com/Quent1L/skol-arena/commit/d0d9d563452eaef850321f32e8924d9adfd9509e))
* convert all timestamp columns to timestampz ([f2f9081](https://github.com/Quent1L/skol-arena/commit/f2f90815723e0a782300ba1c2e0d65c0bd980c18))
* increase better-auth session to 30 days ([5b344e5](https://github.com/Quent1L/skol-arena/commit/5b344e5c738ceba65cb6db1c2ae7211f6edff5a9))

### 🐛 Bug Fixes

* replace timestamp by timestampz ([d2810d2](https://github.com/Quent1L/skol-arena/commit/d2810d2f640f4bd452afaae7bf81db4cb14f88e2))
* router.back() on MatchDetailView when no history ([6d19c82](https://github.com/Quent1L/skol-arena/commit/6d19c82c392e443c4054de0ef569806a2eb4107e))

## [1.2.0](https://github.com/Quent1L/skol-arena/compare/1.1.0...1.2.0) (2026-04-06)

### ✨ New Features

* increase shortName limit and add rules page ([8e3412e](https://github.com/Quent1L/skol-arena/commit/8e3412e88d010d3b9a75eb59c6459a95c379a132))

### 🐛 Bug Fixes

* replace pino transports with sync logfmt formatter for Docker compatibility ([a7c9b91](https://github.com/Quent1L/skol-arena/commit/a7c9b91884cf9f31413461d188f931a46af20544))

### 🔧 Maintenance

* add structured logging with Pino and configurable log level/format ([07600b0](https://github.com/Quent1L/skol-arena/commit/07600b03b2a89f61fabdd308e8e0b5d2f7ef4205))

## [1.1.0](https://github.com/Quent1L/skol-arena/compare/1.0.0-beta.4...1.1.0) (2026-03-22)

### ✨ New Features

* add Offline View ([9d424e6](https://github.com/Quent1L/skol-arena/commit/9d424e6f9205ccca954e20becd3a26652e533eb1))
* add support for static teams ([8e21ab4](https://github.com/Quent1L/skol-arena/commit/8e21ab4f3aced4ce5c88a95a2c5c78addf82d7d7))
* add min and max input score ([589d604](https://github.com/Quent1L/skol-arena/commit/589d604124bf76bfad6b22766e71fb02c6274bc5))
* add bool for disable score entry ([7b39b7a](https://github.com/Quent1L/skol-arena/commit/7b39b7a459b22776b7a8d193c46f1bebfff67822))
* change rules for exceed match limit in championship ([100daa9](https://github.com/Quent1L/skol-arena/commit/100daa937c5c8b7539c1f3de1e06ff983dca59b2))
* enhance UX with smart loading and swipe feature ([8067a8c](https://github.com/Quent1L/skol-arena/commit/8067a8c8a6019776c082f7f0dfa1abb006b2e023))
* implement bracket feature ([d4f3810](https://github.com/Quent1L/skol-arena/commit/d4f38101ed4cbc236011b9185821fe209e28e185))
* use Tiptap editor for tournament description ([e5e1a81](https://github.com/Quent1L/skol-arena/commit/e5e1a819be7115a40a4828fdae414723f6857b90))
* **tournament:** add endpoint to recalculate match points ([4033d93](https://github.com/Quent1L/skol-arena/commit/4033d9397d70bfe0f63e656479067effa469c6be))

### 🐛 Bug Fixes

* **match:** exclude cancelled matches from queries ([905ca42](https://github.com/Quent1L/skol-arena/commit/905ca4219b901623995c1cdb1cd7b81313b93438))

## [1.0.0-beta.4](https://github.com/Quent1L/skol-arena/compare/1.0.0-beta.3...1.0.0-beta.4) (2026-03-04)

### 🐛 Bug Fixes

* refresh service worker ([9f63d6a](https://github.com/Quent1L/skol-arena/commit/9f63d6a5e8ab3b4d192481bc628c5f3b4d915eec))

## [1.0.0-beta.3](https://github.com/Quent1L/skol-arena/compare/1.0.0-beta.2...1.0.0-beta.3) (2026-03-04)

### 🐛 Bug Fixes

* **match:** force select winner match in mobile view ([c42cab0](https://github.com/Quent1L/skol-arena/commit/c42cab072bff4a996fb076b12b9f7b1545cb9ea8))
* **notification:** delete action notification automatically ([f42c69f](https://github.com/Quent1L/skol-arena/commit/f42c69f3353903a1eb40da31ea6886b4c82eb639))

## [1.0.0-beta.2](https://github.com/Quent1L/skol-arena/compare/1.0.0-beta.1...1.0.0-beta.2) (2026-03-04)

### ✨ New Features

* add cancel match ([881e4df](https://github.com/Quent1L/skol-arena/commit/881e4df1c580e02f382d358d067817c108ef47c9))
* add PKCE support for Keycloak authentication ([7798c3f](https://github.com/Quent1L/skol-arena/commit/7798c3f943ebc037b23444c68bfdcc117964053e))
* keep same tab after page refresh ([6c9ccc7](https://github.com/Quent1L/skol-arena/commit/6c9ccc7120593bea97092b354c1e6d4771f13d11))

### 🐛 Bug Fixes

* calcul standings service ([03f24a9](https://github.com/Quent1L/skol-arena/commit/03f24a9aa38fc0acce5b29c18ee8061be1468b82))
* check match validation ([c40712b](https://github.com/Quent1L/skol-arena/commit/c40712b519ac3a9fe85c23951645a326662f7637))
* players stats source ([cfca6e7](https://github.com/Quent1L/skol-arena/commit/cfca6e7e4483c70f2750da8ccc759a461148f1e7))

## 1.0.0-beta.1 (2026-03-03)

Initial release.
