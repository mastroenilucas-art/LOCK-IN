# Program format

Every client program is one JSON document. You edit it in the app: **Coach → Programs → tap a program**.
The editor checks it when you tap **Save** and tells you exactly what to fix.

The easiest way to write a new one: in the editor, tap **Copy prompt for Claude**, paste it into Claude,
describe the client, and paste Claude's answer back into the editor.

`block-1.json` in this folder is a complete example (the template program).

## Top level

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Name the client sees at the top, e.g. `"Ana · Block 2"` |
| `subtitle` | no | One line under the title |
| `unit` | no | `"kg"` (default) or `"lb"` |
| `increment` | no | What "add weight" means, e.g. `"5 lb on a bar, the next dumbbell, or one pin"` |
| `weeks` | yes | Number of weeks, counting a deload week (1–52) |
| `deloadWeek` | no | Week number of the deload, or `null` for none |
| `phases` | no | Coaching text from a week onward: `{ "1": "Weeks 1–2 · <b>Ramp-in</b>…", "3": "…" }` |
| `effort` | no | `{ "rampUntil": 2, "techniqueFrom": 5, "beatFrom": 7 }` (see below) |
| `techniques` | no | Last-set techniques by name. `myo` and `partial` are built in |
| `shortPairs` | no | How many pairs **Short** mode keeps (leave out to hide Short mode) |
| `twoDay` | no | Lets the client tap **Only 2 days** (see below) |
| `warmup` | no | `{ "title": "…", "steps": ["…", "…"], "note": "…" }` |
| `sessions` | yes | The training days (1–7) |
| `guide` | no | The **Plan** tab: `[ { "title": "…", "highlight": true, "rows": [["Label", "Text"]] } ]` |
| `footer` | no | Small print at the bottom |

Text can use `<b>` and `<i>`. Anything else is shown as plain text.

## Sessions

```json
{
  "id": "A",
  "name": "Session A",
  "title": "Session A — Bench, pull-ups, legs",
  "focus": "Strength day: your heaviest pressing and pulling while you're fresh.",
  "short": "chest, lats, quads and side delts",
  "pairs": [ … ]
}
```

`id` is 1–8 letters or numbers and must be different for each session. `short` describes what Short mode covers.

## Pairs

A pair is 1–4 exercises done back to back, with the rest between rounds.

```json
{ "label": "Chest & lats · heavy", "rest": 60, "note": "Optional setup tip", "exercises": [ … ] }
```

`rest` is seconds (0–900). It sets the **Rest** timer button.

## Exercises

```json
{
  "name": "Barbell bench press",
  "sets": 3,
  "reps": "5–8",
  "muscle": "chest",
  "kind": "free",
  "warmup": 2,
  "technique": "myo",
  "bodyweight": false,
  "cue": "Shoulder blades pinned, feet planted, touch your lower chest.",
  "video": "bench press technique",
  "busy": "Smith machine bench press — 3 × 5–8",
  "busyNote": "Same lift on a fixed path.",
  "noGym": "Push-ups, loaded backpack — 3 × 8–15",
  "noGymNote": "Hands on two books for extra depth."
}
```

| Field | What it does |
|---|---|
| `name` | Must be different from the other exercises in the same session. Renaming starts its history fresh |
| `sets` | 1–12 |
| `reps` | A range like `"8–12"` or a single number like `"10"`. Ranges drive the progression hints |
| `kind` | Sets the effort rule: `free` (barbell/dumbbell compound: never to failure), `compound` (machine, cable, bodyweight), `isolation`, `core` |
| `warmup` | `0`, `1` or `2` warm-up sets, or a short custom text |
| `technique` | Optional last-set technique (`myo` or `partial`), shown from `effort.techniqueFrom` on |
| `bodyweight` | `true` for weighted pull-ups, dips…: the weight box says `+kg` |
| `cue` | One or two coaching sentences |
| `video` | YouTube search words, or a full `https://` link |
| `busy` / `busyNote` | The swap shown under **Busy** (machine taken) |
| `noGym` / `noGymNote` | The swap shown under **No gym** |

## Effort rules

The bold line on each exercise comes from `kind` and the week:

- Weeks up to `effort.rampUntil`: "Stop 2–3 reps before failure"
- After that, by kind: `free` "Stop 1 rep short", `compound` "Last set: 0–1 reps left", `isolation` "Last set to failure", `core` "Stop 1–2 reps short"
- From `effort.beatFrom`: adds "· beat last week"
- The deload week: "first half of the sets, same weight, stop 3–4 reps short"

To change the wording, add `"text"` inside `effort`, with any of the keys `ramp`, `free`, `compound`, `isolation`, `core`, `deload`, `beat`.

## Two-day weeks

```json
"twoDay": { "from": "C", "into": { "A": [1, 2], "B": [3, 4] } }
```

In a week where the client taps **Only 2 days**, pairs 1–2 of Session C are added to the end of Session A, and pairs 3–4 to Session B. Leave `twoDay` out if it doesn't fit the program.

## Progression hints

The app compares each exercise with the last week it was logged:

- Every set at the top of the rep range → "Add weight today"
- Any set under the bottom of the range → "Drop about 5–10%"
- Same weight and no more reps for two weeks → "Stalled" tips
- Otherwise → "Same weight as last week. Beat it by a rep."
