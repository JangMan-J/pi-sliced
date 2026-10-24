---
type: decision-request
thread: trace
created: 2026-10-24T09:30:00Z
created_by: claude-opus-5-5
---

# Proof 1: state of convergence and the decisions it needs

## Where it stands

Tracer `trace-2` with judge `judge-3`, all 9 Candidates traced, 0 pending judge questions.

| Candidate | Files traced / fixture | Outside traced / fixture | Status |
| --- | ---: | ---: | --- |
| tdd | 3 / 3 | 0 / 0 | match |
| game-ui-frontend (canary) | 17 / 17 | 0 / 0 | match |
| amc | 7 / 7 | 14 / 14 | match |
| canvas-design | 83 / 83 | 0 / 0 | match |
| shadcn | 16 / 16 | 7 / 7 | match |
| figma | 64 / 64 | 5 / 5 | match |
| shopify | 128 / 128 | 14 / 14 | match (the 129th file is gone, see judge-3) |
| zoom | 646 / 646 | 159 / 163 | 4 outside items differ |
| hyperframes | 406 / 405 | 69 / 70 | 3 files and 9 outside items differ |

The fixtures were updated by two rounds of blind adjudication (154 items; Opus adjudicators under `adjudicate-brief.md` and `rulings.md`). Every change is recorded in each fixture's `adjudications` list.

## judge-3 (new judge version; no stored answer was edited)

`judge-2` answered every class as "direction or mention?". That contradicts F7 for the `skill-folder-only` class: F7 counts a path to a skill file with or without a verb, and the class exists only for the F7 collision amendment (user-project files). `judge-3` asks each class its own ruling's question and quotes the F8 and H2 examples verbatim ("The `.mjs` helpers live in the skill's `scripts/` directory" → false). Effect: shopify's `scripts/track-telemetry.ps1` (the 129th file) is out; `hyperframes-cli/SKILL.md` is in through `preview-render.md:160` ("… in `SKILL.md`"). 333 questions answered, 0 pending. One judge's part was discarded and re-run because it ran a script that drafted answers; another because every reason was the same generic sentence (`.pad/trace/judge/quarantine/`).

Confirm: **D0. judge-3's reading of `skill-folder-only` (F7: a mention counts unless the path names a user-project file).** The zoom readers flagged 212 F7 edges as misreadings in this direction (inventories, naming conventions); none changes a file set.

## Decisions

### D1. Misreadings the adjudicators raised (ruling as written vs the definition)

The fixture already follows the definition in each case. To match it, the tracer needs the ruling amended as proposed. Items marked *implemented* already pass.

| # | Ruling | Items | Proposed amendment | Tracer |
| --- | --- | --- | --- | --- |
| a | O3 | shopify `commonmark.org`, `en.wikipedia.org`, `yarnpkg.com` (URLs in description and error strings of a bundled GraphQL library); hyperframes `www.googleapis.com` (an OAuth scope id) | In a run script, a URL counts when it is code or a whole string value, not when it sits inside a message or description; OAuth scope URLs (`https://www.googleapis.com/auth/…`) are identifiers, never fetched. | implemented |
| b | O1 | zoom `./meetingSDKDemo`, `./SkeletonDemo`, `./ZoomVideoSDKBot`; by consistency `.\vcpkg`, `.\bootstrap-vcpkg.bat` | A program run by relative path (`./x`, `.\x`) is the user's build output or a script in a checkout, not a CLI. What it installs still counts (`.\vcpkg install jsoncpp`). | implemented |
| c | O4 | hyperframes `GCS_CREDS` (the service-account JSON that `gemini-auth.mjs` and `.py` read) | Add the suffixes `_CREDS` and `_CREDENTIALS`. Then `GOOGLE_APPLICATION_CREDENTIALS` (read by the same scripts; adjudicated out under O4 as written) counts too and the fixture adds it. Or keep O4: the fixture drops `GCS_CREDS`. | not yet |
| d | O3 | hyperframes `static.heygen.ai` (`.cube` URLs in `media-use/luts/index.json`, which `resolve --type lut` downloads) | Recommend: keep O3 (data files state no network requirement); the fixture drops the host, and the exercise run observes run-time hosts. Alternative: URLs in pulled-in JSON data files count (needs a check for `package.json`-style metadata URLs). | not yet |
| e | F11 | hyperframes `registry/blocks/vfx-magnetic/vfx-magnetic.html` ("(See registry/blocks/vfx-magnetic/vfx-magnetic.html for complete implementation)" as a comment in a Markdown code example) | Amend F11: a comment inside a code example in a Markdown file is read as prose (F7, F8, H1 apply; this one leaves the skill folders, so it is judged under H1). Comments in run scripts still never count (`locate.mjs:8` → `grounding/PROTOCOL.md` stays out). Or keep F11: the fixture drops the file. | not yet |
| f | F7 | hyperframes `product-launch-video/scripts/lib/transition-registry.mjs` | One adjudicator held that `TRANSITION-REGISTRY.md:12` ("The deterministic injector (`product-launch-video/scripts/transitions.mjs inject`) reads …") only describes the harness; three adjudications counted the same edge (`transitions.mjs`, `transitions.json`, `pad-frame-duration.mjs`). The fixture follows the majority (F7 as written). Confirm. | matches |

### D2. Network hosts that need a reading the tracer's rules cannot make (O3)

| Candidate | Host | Line | Adjudicated | Tracer |
| --- | --- | --- | --- | --- |
| zoom | `status.zoom.us` | "7. **Check Zoom Status** - Visit [status.zoom.us](…)" | counts | misses ("visit" is not an O3 verb; "visit the [Zoom Developer Forum]" is adjudicated out) |
| zoom | `developers.zoom.us` | "From `https://developers.zoom.us/changelog/`: … Find the RSS link"; "Open the official classic scope catalog" (URL on line 3) | counts | misses (no verb before the URL on its line) |
| hyperframes | `developers.heygen.com` | "Install the HeyGen CLI through its [verified release instructions](https://developers.heygen.com/cli), then run:" | counts | misses |
| hyperframes | `fonts.googleapis.com` | `frame-showcase.html` (opened in a browser) loads the stylesheet | counts | misses (HTML is not read for hosts) |
| hyperframes | `linear.app`, `stripe.com` | bash fence: `npx hyperframes capture https://stripe.com # scaffold from a website` | does not count (an example standing in for the user's site) | counts |

Options:
- **A. Judge O3 by reading**, like H2 does for files: every non-placeholder URL in a prose line or Markdown fence of a pulled-in file becomes a judge question ("does using the skill contact this host?"); run scripts stay deterministic. About 1,650 line-host questions today (zoom 1,429), about 30 judge runs, and the same cost again for every new Candidate.
- **B. O3 as the tracer reads it**: a prose line counts when one of fetch, download, open, read, follow comes before the URL; every URL in a shell fence counts; HTML pages are not read. The fixtures follow: drop `status.zoom.us`, `developers.zoom.us`, `developers.heygen.com`, `fonts.googleapis.com`; add `linear.app`, `stripe.com`. The Footprint's host list is then a static floor, and the exercise run supplies the observed hosts.

Recommendation: B. The prototype run already showed static tracing cannot see run-time hosts, and A spends most of its questions on zoom's documentation links.

### D3. Install forms (O2)

- zoom `@zoom/videosdk-react`: `npm install https://github.com/zoom/videosdk-react/releases/download/v0.0.1/zoom-videosdk-react-0.0.1.tgz`.
- zoom `flutter_zoom_videosdk`: `flutter pub get` after a `pubspec.yaml` block that declares it.

Recommendation: O2 as written. An install command must name the package; a URL install is covered by its host (`github.com`, already counted). The fixture drops both.

### D4. `skills/motion-graphics/catalog-map.md` (and `categories/stat/module.md`, reached only through it)

`categories/maps/module.md:61`, under "## Register", says to add the module to `catalog-map.md`. judge-3 answered true (F7: a mention of a skill file counts). The adjudicator answered false (S1: a contributor workflow for the repository, registering a new module). Options: (i) the fixture follows judge-3 and adds both files; (ii) the fixture stays and the tracer's contributor-workflow detection learns "register" headings, with the question re-asked under a new judge version. Recommendation: (ii), because registering a module edits the repository, the same class as "Contributing a block".

### D5. Reconciliations I made where adjudications disagreed (confirm)

1. `hyperframes-cli/references/beats.md` counts: same mandatory reference table in `hyperframes-cli/SKILL.md` as `cloud.md`, `lambda.md` and the others, which count. Its adjudicator assumed `SKILL.md` was not pulled in.
2. `faceless-explainer/scripts/assemble-index.mjs` and its import `lib/bgm-volume.mjs` count: F7 co-located filename in the pulled-in `transitions.mjs:220` ("run assemble-index.mjs first"). The adjudication of `lib/assets.mjs` counted this edge; the other two adjudications saw only `production-loop.md:13`.
3. `product-launch-video/scripts/assemble-index.mjs` and `lib/bgm-volume.mjs` count: the same edge in `product-launch-video/scripts/transitions.mjs:220`.
4. `product-launch-video/scripts/lib/transition-registry.mjs` counts (see D1f).
5. figma `developer.mozilla.org` and `developers.figma.com` dropped: documentation links in JSDoc comments of `plugin-api-standalone.d.ts`, the class adjudicated out for `help.figma.com` and `www.typescriptlang.org` (the latter on the same line 888).
6. shopify `shopify-dev-staging${t}.shopifycloud.com` dropped: a templated host, as adjudicated for the `${e}` variant.
7. zoom `vcpkg` CLI dropped (see D1b).
8. hyperframes `cdn.jsdelivr.net` added: the run script `faceless-explainer/scripts/assemble-index.mjs:581` writes `<script src="https://cdn.jsdelivr.net/npm/gsap@…">` into the index it assembles (O3: a URL in a script the skill runs). Its adjudication saw only snippets and registry blocks.

### D6. Confirm the nine fixtures

After D0–D5, the fixtures in `.pad/trace/expected/<base>.json` are copied to `tests/trace/fixtures/`. Appendix B lists the misreadings each fixture records.

## What changed in the tracer since the last report

- Sentences span wrapped lines (a paragraph is one text), which changes the judge question for wrapped prose.
- `` `x.mjs` (home: `/a`, `/b`) `` resolves to that file in each named skill; `` `/skill` → `a` + `b/` (incl. `c`) `` resolves each path inside the skill.
- Scripts: bare co-located filenames in any non-comment text (help text, error messages) are F7 paths; `path.join` calls spanning lines are read.
- A docs route without its extension (`docs/reference/speed-ramps`) names its `.md`/`.mdx` page.
- Outside: process calls in JS and Python scripts (`execFileSync("ffprobe", …)`, `subprocess.run([...])`), install commands written anywhere in a fence line or script string, `pipInstall(DEPS)` arrays, arrays of scoped package names, platform `.exe` names, `"$HF_BIN"`-style program variables, `docker run … image cmd`, Python registry names (`google.auth` → `google-auth`, `dotenv` → `python-dotenv`) and a full standard-library list, inline code spans that hold a command, env-var tables under an environment heading (not "Runtime-only"), subcommands written short (`resolve -t grade` when the skill runs `npx hyperframes media-use resolve`) are not CLIs, `.d.ts` doc comments state nothing, a prose URL needs its verb before it.

## Appendix B: misreadings recorded in the fixtures (from the readers and adjudicators)

Each: ruling, item, ruling gives → definition gives (the fixture follows the definition), reason, source line. `superseded` means a later adjudication decided the item the other way and the fixture follows that.

### figma/mcp-server-guide/figma-generate-diagram (9)

- F2 `skills-figquery/figma-use/SKILL.md`: excluded → included. This is an actual direction to use/load/consult the named skill, not a passive mention. The frozen definition includes directions to sibling skills. The file is independently reached by valid links, s (SKILL.md:67)
- F2 `skills-figquery/figma-use-figjam/SKILL.md`: excluded → included. This is an actual direction to use/load/consult the named skill, not a passive mention. The frozen definition includes directions to sibling skills. The file is independently reached by valid links, s (SKILL.md:67)
- F2 `skills-figquery/figma-generate-library/SKILL.md`: excluded → included. This is an actual direction to use/load/consult the named skill, not a passive mention. The frozen definition includes directions to sibling skills. The file is independently reached by valid links, s (SKILL.md:183)
- F2 `skills-figquery/figma-generate-diagram/SKILL.md`: excluded → included. This is an actual direction to use/load/consult the named skill, not a passive mention. The frozen definition includes directions to sibling skills. The file is independently reached by valid links, s (plan-board-content.md:5)

### heygen-com/hyperframes/hyperframes-core (47)

- F7 included → excluded, 24 edges; none changes the file set (each target is pulled in by another edge):
  - 19× A filename in the credits inventory only states what is bundled, not an instruction to use it.
  - 3× Skills-root-relative path appears in a description of harness internals, not a direction to read/run/load. Pla
  - 1× A standing delegation grant in the current user project, not a direction to read HyperFrames repository contri
  - 1× F7 project-path collision: CC BY downloaded credits are written into the user project; bundled credits describ
- F11 `registry/blocks/vfx-magnetic/vfx-magnetic.html`: excluded → included. Although inside a code comment, this is a direct reader-facing instruction to see the complete implementation omitted from the snippet, not a path merely mentioned by code. The frozen definition follo (html-in-canvas-patterns.md:203)
- O3 `fonts.googleapis.com`: excluded → included. O3 literally covers commands/scripts and directional prose, not HTML stylesheet links. Opening this executable showcase loads the font stylesheet; the frozen definition includes this required network  (frame-showcase.html:10)
- F11 `skills/motion-graphics/grounding/PROTOCOL.md`: excluded → included **superseded**. The reader-facing header explicitly sends the author to the full protocol. This is a direction to read, even though the source header is a code comment. (locate.mjs:8)
- O2 `google-auth`: excluded → included. Explicit prose instruction to install these Python packages is required setup, even though not formatted as an install command. (tts.md:121)
- O2 `requests`: excluded → included. Explicit prose instruction to install these Python packages is required setup, even though not formatted as an install command. (tts.md:121)
- O4 `GOOGLE_APPLICATION_CREDENTIALS`: excluded → included **superseded**. Required service-account credential source explicitly read by this script; suffix heuristic misses it but frozen credential definition includes it. (gemini-auth.mjs:9)
- O4 `GCS_CREDS`: excluded → included. Required service-account credential source explicitly read by this script; suffix heuristic misses it but frozen credential definition includes it. (gemini-auth.mjs:10)
- O3 `static.heygen.ai`: excluded → included. These are configured on-demand LUT downloads, not documentation links; the catalogue explicitly says downloaded + frozen. (index.json:9)
- O1 `aws`: excluded → included **superseded**. The unlabelled code fence is nevertheless an explicit numbered upload instruction requiring this CLI; the frozen definition includes it. (README.md:23)

### nvidia/skills/amc-run-video-calibration (1)

- O4 `NGC_API_KEY`: excluded → included. The command sends a literal key placeholder to Docker stdin rather than setting or reading an environment variable. Nevertheless Step 1 explicitly requires asking for and using an NGC API key; the fro (SKILL.md:122)

### openai/plugins/debug-zoom-integration (243)

- F7 included → excluded, 212 edges; none changes the file set (each target is pulled in by another edge):
  - 154× Documentation Structure inventory only. It illustrates the layout; no instruction directs the agent to read, r
  - 49× States the entrypoint/naming convention. It does not direct the agent to read, run, or load the named file.
  - 7× Historical provenance only, not a direction to read the previous source.
  - 2× Describes the relationship or location of existing documentation, rather than directing the agent to read it.
- F8 `plugins/zoom/skills/cobrowse-sdk/references/`: excluded → included. Under the Docs Links / 404s fix, "Prefer the curated references" directs the agent to consult this directory instead of broken external docs; "prefer" is absent from the verb list. (common-issues.md:15)
- F8 `plugins/zoom/skills/`: excluded → included. "Route to the most relevant deep references" is an explicit workflow direction into this directory, even though "route" is absent from the verb list. (SKILL.md:23)
- F11 `plugins/zoom/skills/rest-api/examples/recording-pipeline.md`: excluded → included. The comment explicitly says "see" this reference for additional implementation information. The frozen definition does not exclude reading directions because they are in code comments. (meeting-lifecycle.md:397)
- F8 `plugins/zoom/skills/rest-api/references/`: excluded → included. "Treat those files as the local source of truth for method/path discovery" directs consultation of the directory for endpoint discovery; "treat" is absent from the verb list. (full-guide.md:31)
- F11 `plugins/zoom/skills/video-sdk/linux/references/linux-reference.md`: excluded → included. The comment explicitly says "see" this reference for additional implementation information. The frozen definition does not exclude reading directions because they are in code comments. (sdk-architecture-pattern.md:78)
- O3 `marketplace.zoom.us`: excluded → included. Go to is an explicit instruction to open the site to obtain credentials, not a documentation link; O3's literal verb list omits this synonym. (authentication-pattern.md:309)
- O3 `devforum.zoom.us`: excluded → included **superseded**. Visit explicitly directs opening the website conditionally; O3's literal verb list omits this synonym. (common-issues.md:552)
- O4 `AWS_ACCESS_KEY_ID`: excluded → included **superseded**. Explicit AWS credential required for batch authentication; _KEY_ID suffix is outside O4 despite being a credential. (environment-variables.md:25)
- O4 `ZOOM_VIDEO_SDK_KEY`: excluded → included. The table explicitly requires this credential for server-side identity/signing, but does not literally set or read it. The frozen definition includes a credential the skill needs. (environment-variables.md:5)
- O4 `ZOOM_VIDEO_SDK_SECRET`: excluded → included. The table explicitly requires this credential for server-side identity/signing, but does not literally set or read it. The frozen definition includes a credential the skill needs. (environment-variables.md:6)
- O4 `ZOOM_SDK_KEY`: excluded → included. The prescribed server-side JWT implementation reads this credential. O4 omits Markdown TypeScript examples, but the frozen definition includes credentials needed by this implementation. (framework-integrations.md:41)
- O4 `ZOOM_SDK_SECRET`: excluded → included. The prescribed server-side JWT implementation reads this signing secret. O4 omits Markdown TypeScript examples, but the frozen definition includes credentials needed by this implementation. (framework-integrations.md:53)
- O1 `ffplay`: excluded → included. The cmd fence directs playback using this CLI; omitting Windows shell fences drops a real run instruction. (raw-audio-capture.md:186)
- O1 `ffmpeg`: excluded → included. The cmd fence directs conversion using this CLI; its fence language is missing from O1. (raw-audio-capture.md:192)
- O1 `bootstrap-vcpkg.bat`: excluded → included **superseded**. The downloaded bootstrap program is explicitly executed in a powershell fence, a shell language missing from O1. (build-errors.md:98)
- O1 `vcpkg`: excluded → included **superseded**. The installation instructions run vcpkg in a powershell fence; it is not an exempt installer in O1. (build-errors.md:99)
- O1 `xcopy`: excluded → included. A post-build event explicitly runs xcopy in a cmd fence. O1 omits cmd; xcopy is not in its excluded command list. (build-errors.md:155)

### openai/plugins/game-ui-frontend (1)

- O1 `gltf-transform`: excluded → included **superseded**. This numbered workflow step explicitly directs running the named tool; it is not a mere tool mention. The frozen Outside requirement definition covers a CLI needed by the workflow even though the dire (web-3d-asset-pipeline.md:21)

### shadcn-ui/ui/shadcn (1)

- O2 `react`: excluded → included **superseded**. The skill explicitly directs copying and rendering this helper. Its runtime React import is a package needed to load it, even though the copied TSX helper is not a run script. Include React under the  (color-pair.tsx:1)

### shopify/shopify-ai-toolkit/shopify (5)

- F7 included → excluded, 4 edges; none changes the file set (each target is pulled in by another edge):
  - 1× The possessive explicitly selects the developer's application manifest, not this skill's build manifest. An id
  - 1× This architecture entry describes a generated/user theme setting schema, not a direction to read the bundled e
  - 1× The instruction updates translations in the theme being implemented. It does not load the sample locale shippe
  - 1× The filenames are GraphQL arguments selecting the merchant's remote live theme. Content arrives through shopif
- O5 `shopify-dev-mcp`: included → excluded. This comment explains which independently existing tool events the hook does not duplicate. It neither uses nor requires that MCP server; installing/connecting it is not needed for this skill. (track-telemetry.sh:20)

