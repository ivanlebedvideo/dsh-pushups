# dsh-pushups

A small [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) plugin for the **Web GUI**:
every message you send to the assistant becomes **one push-up of debt**. When you stand up
from the computer, you pay the debt off — in one set or in parts.

The point is not statistics. The point is that the number sits under the composer the whole
time, grows when you talk instead of moving, and refuses to disappear on its own.

```
┌──────────────────────────────────────────────┐
│  ... chat ...                                │
│  ┌────────────────────────────────────────┐  │
│  │  message the assistant                 │  │
│  └────────────────────────────────────────┘  │
│              🏋 Push-ups: 7                  │
└──────────────────────────────────────────────┘
```

Click the chip, and a dialog shows the lifetime message count, the unpaid debt, the streak of
days closed without debt, recent payments, partial-payment buttons (`+5`, `+10`, `+25`, all),
a custom amount, and a language switch (English / Русский / 中文 — English by default).

## What counts

One admitted human prompt: a session event `user/message` whose source is
`{ kind: 'user', rpcId: <string> }`. This is exactly the signal DSH itself uses for
"a human typed this in the Web GUI".

Not counted:

- retries — `user/message` is appended once per admitted message, never per attempt;
- automatic goal continuation rounds (`source.kind === 'goal'`);
- scheduled, webhook, tool-context and other machine-produced user-role messages;
- subagent work — child sessions carry no `rpcId`;
- messages sent before the plugin was installed (the counter starts at zero on install);
- prompts sent from other clients (TUI, ACP, SDK) — the `rpcId` discriminator is Web-only.

## Requirements

- DSH `0.2.0-rc.1` or newer with the `web` profile;
- no build step: the Client half is plain JavaScript.

## Install

From an absolute path:

```
plugin_manager
  action: install_bundle
  target: /absolute/path/to/dsh-pushups
```

From a git checkout:

```
git clone https://github.com/ivanlebedvideo/dsh-pushups.git
```

then install that directory the same way. `install_bundle` adds the package to the profile,
selects the bundle and applies its patch; a new bundle activates without a server restart,
but reload the page (Ctrl+R) so the browser loads the new Client module.

Disable it at any time:

```
plugin_manager
  action: set_plugin
  target: pushups
  enabled: false
```

## Data

The ledger is a single JSON file owned by the Host half:

```
$DSH_HOME/storages/pushups/state.json      # default: ~/.dsh/storages/pushups/state.json
```

It holds the install timestamp, the lifetime count, the current debt, the streak, bounded
per-day counters (400 days) and the last 500 payments. The Host also serves three loopback
routes for the Client: `GET /pushups/state`, `POST /pushups/pay`, `POST /pushups/reset`.
They are unauthenticated by design — DSH's web server binds `127.0.0.1` and this data is a
push-up counter, not a secret.

## Agent tool

The Host registers one read-only tool, `pushups_status`, so the assistant can answer
"сколько я должен?" with the live number. It never adds nudges to replies on its own.

## Rules baked in

- 1 message = 1 push-up; no daily cap, no coefficient — a cap is permission to cheat;
- debt carries over to the next day and never expires;
- partial payments are allowed;
- a day that ends with debt breaks the streak; a day closed at zero extends it;
- "Reset everything" requires a second click and zeroes lifetime, debt and history;
- nothing blocks sending — blocking would make you write less, not move more.

## Limitations

- Web GUI only; the counter is global across all sessions and projects of this installation.
- Day boundaries follow the Host machine's local time zone.
- The streak advances when the Host observes a day rollover (on any message, payment or state
  read), so it is an honest approximation, not a cron job.
- No data migration: the state file carries a version and a mismatched version starts fresh.

## License

MIT.
