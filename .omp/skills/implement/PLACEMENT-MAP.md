# Placement map

How the shape-review page and the end-of-work PR page are drawn. `implement/HITL.md` § Shape
review and `land` § Publishing (PR) say when the page runs and what the human answers; this file
owns the building. A filled example from the format trial (shh_ai #68) sits beside this file:
`placement-map-example.html`.

## Who builds it

The main session writes one content brief and sends it to one `designer` subagent
(`agents/designer.md`). The subagent builds the page, checks it, publishes it, and returns the
artifact id and URL. The main session never draws the page itself: it writes the brief, shares
the artifact, and runs the gate (`implement/HITL.md` § Shape review).

## The brief

Send these fields, in this order. The subagent copies each field into the matching page section.

1. **Ticket id**: the tracker reference, as the page eyebrow ("Shape review · TomGrozev/shh_ai
   #68"). For a PR page: the PR title and the spec or ticket range.
2. **Triggers and questions**: each trigger name with its `**Human:**` question, verbatim from
   the ticket.
3. **Intent**: one sentence of what the ticket makes true.
4. **Acceptance examples**: 2 to 3, given / when / then, one line each.
5. **Boxes**: at most 9. Each box has a name, a path (file or module), a status (NEW, CHANGED,
   REUSED, REMOVED, STORED), and for NEW one "Why new" line naming the existing thing it does
   not extend.
6. **Edges**: who calls or writes whom, each with a short label (at most 14 characters, all
   caps). A relationship the change removes is dashed.
7. **Checks**: two, picked from the pool in `implement/HITL.md` § Shape review to match the
   trigger, each with its evidence: the command and its output.
8. **Decisions**: 1 to 5, each with a `Name:` line and named options (A, B, ...).
   Every option carries one reasoning line: when and why a person picks it, its main gain and
   its main cost. Take the reasons from the spec, the ADRs, and the code, never invented.
   State the pick visibility: hidden until the human answers when any trigger on the page
   hides it (`structure`, `one-way-door`); small muted text otherwise.
9. **Title**: the page `h1` (usually the ticket subject).
10. **Footer**: the code reference, the ADR link, and the gate text.

The brief is content only: names, paths, lines of text, evidence. The subagent owns every
drawing decision.

## Drawing rules

The subagent draws with `skill://diagram-design`. If that does not resolve, read
`~/.agents/skills/diagram-design/SKILL.md`. Read it first; this brief overrides the
default skill reading in `agents/designer.md`.

- **Type grammar**: the Architecture type (`references/type-architecture.md`) for the layout.
  The two-snapshot Architecture-delta format does not fit: a placement map has one snapshot.
- **Status encoding**: carry the delta reference's redundant encoding
  (`type-architecture-delta.md` § Change vocabulary) onto the five statuses. Status is read
  from text plus line style, never colour alone:

  | Status | Treatment |
  |---|---|
  | NEW | Heavy accent stroke, accent-tint fill, `+` badge |
  | CHANGED | Solid stroke, inset edge rule, `Δ` |
  | REUSED | Quiet thin stroke |
  | REMOVED | Dashed `4,3`, line-through name, `−` |
  | STORED | `paper-2` fill, inset top rule |

  The legend names each treatment in use on the page. It also lists the dashed
  removed-edge entry when the map draws a removed edge.
- **Budget**: at most 9 boxes (the skill's §7 node budget). More means the ticket is too big:
  report back, and the main session splits it. On a PR page with more than 9 boxes: an overview
  map plus one detail map per area, each within the budget.
- **Ids**: `box-<slug>` on each box group, `decision-<slug>` on each decision card. The slug
  is the brief's `Name:` field in kebab case: each run of characters other than letters and
  digits becomes one hyphen (`ApiConverter.Anthropic` becomes `box-api-converter-anthropic`,
  `select_provider/0` becomes `box-select-provider-0`). These ids are the comment targets.
- **Page layout**: the first screen is a 1440x900 viewport. It holds the header (ticket id,
  triggers, questions), the intent, and the whole map with its legend. Acceptance examples,
  checks and decisions follow below the map. The page is one self-contained `index.html`; the
  map is inline SVG.
- **Profile**: `nord` (`~/.diagram-design/profiles/nord.md`): Nord palette, system fonts, no
  font `<link>`. `install.sh` copies it over the skill's `references/style-guide.md`, and its
  profile header skips the first-run style question in any repo. Do not write a `.diagram-design`
  marker into the project. A marker that already names another profile is the user's choice; it
  stays and wins. If the style guide header does not name `nord`, stop and say so; do not fall back
  to the shipped default.

## Checks before publishing

`install.sh` fetches `scripts/verify-geometry.py` (and anything it imports) from
github.com/cathrynlavery/diagram-design into `~/.agents/skills/diagram-design/scripts/`. The
installed skill alone has no copy. On the finished file, from that skill directory:

```
python3 scripts/self_check.py index.html --offline
python3 ~/.agents/skills/diagram-design/scripts/verify-geometry.py index.html
```

Both must pass with no findings. `--offline` fails when a Google Fonts link is present; the
`nord` profile ships none.

## Publishing and commenting

The subagent publishes one `html` artifact and returns the artifact id and URL. Set up
`r3 create` first: `skill://publish-artifacts-to-r3` covers the `R3_AGENT_SESSION` value.
`r3 create --version` starts at 1, so the first publish is `--version 1`. The main session
shares the URL and runs the gate.

The human comments on one box or one decision by its id:

```
r3 thread add <artifact> --file index.html --version <seq> --view rendered --selector '#box-<slug>'
```

The same command with `#decision-<slug>` anchors a decision. Name this in the hand-off message,
so the human knows the ids exist.

## The PR page

The end-of-work PR page (`land` § Publishing) uses the same format and
the same designer flow: the same brief fields, with the whole change in place of the ticket id,
and the defaults and claims sections after the map. One map covers the whole PR; more than 9
boxes takes an overview map plus one detail map per area.
