# dsh-session-landing

When a session opens, align the window top with the start of the **latest output block**; when that block is shorter than the viewport the rule clamps to the bottom on its own.

## The problem it solves

DSH keeps an in-memory "semantic reading position" per Session. Any gesture that moves the scrollport away from the floor — a manual scroll, clicking a sidebar search hit, "load older" — pins a mid-transcript position that is then **restored on every later entry**. When the saved anchor row no longer exists (common in long sessions, because the Turn-process groups are re-built once history is fully loaded), the restore degrades to writing the **old raw pixel offset**, which lands the reader somewhere in the upper middle of an old conversation.

No stock setting controls this (`ui-chat` only carries `linkOpening` / `performanceUsage` / `transcriptView`).

This plugin takes over that single landing:

- find the first output row of the newest Turn in the window — the "Completed in X" line, rendered by the `turn-process` node above its content;
- align that row's top edge 8px below the scrollport's top edge;
- clamp the write to the real scroll range, so a block shorter than the viewport lands at the bottom by construction;
- keep correcting while history pages and late layout (images, code blocks) move the geometry, and stop 1.5s after it settles;
- yield immediately on wheel, touch, pointer, or scroll keys (clicks and keys inside the composer are not reading gestures).

A streaming Session is never top-aligned: it is pinned to the floor once and then handed back to the stock tail follower.

## Install

Keep the source in a local plugin directory and junction it into the profile's `node_modules`:

```powershell
$src = "D:\Users\c1732\DeepSeekHarness\Agent学习\plugins\dsh-session-landing"
$dst = "D:\DeepSeekHarness\.dsh\profiles\desktop\node_modules\dsh-session-landing"
New-Item -ItemType Junction -Path $dst -Target $src
```

Then append to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: session-landing
      name: 'dsh-session-landing'
```

Fully quit and restart DSH; client plugins are not hot-loaded.

## Toggle and rollback

- Toggle: Settings → General → "Session landing".
- Rollback: delete the `- insert:` block above and restart — the stock behavior returns without touching the junction.

## Interaction with other plugins

- `dsh-history-autoload`: this plugin recomputes its landing while paging runs, so both coexist.
- `dsh-search-locate`: an explicit search jump happens after this landing yields, so the hit still wins.

## Internal contract it depends on

| Selector | Purpose |
| --- | --- |
| `[data-chat-flow]` | transcript column |
| `[data-chat-anchor-key]` / `[data-chat-flow-kind]` / `[data-chat-turn]` | flow rows and Turn membership |
| `[data-turn-process-hidden]` | rows folded into the process group and currently invisible |
| `[data-chat-running]` | Session is streaming |
| `[data-conversation-scroll]` | shared scrollport (falls back to the nearest scrollable ancestor) |
| `[data-composer-seat]` | composer, excluded from reading intent |

## License

MIT
