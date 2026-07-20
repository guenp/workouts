# Examples

Importable sample data in the app's export format.

**How to import:** Settings (gear icon) → *Upload data* and pick a file — or *Paste data* and paste the file's contents. You'll be shown which sections the file contains and can choose what to import. Workouts and folders are added to yours (deduplicated by id, so importing a file twice won't create duplicates); importing the weekly plan example overwrites your recurring template.

| File | Contents |
|---|---|
| `seven-minute-workouts.json` | The NYT/ACSM 7-Minute Workout and the Advanced 7-Minute Workout, in a "7-Minute Workouts" folder |
| `strength-routines.json` | Full-body dumbbell, lower body & glutes, upper-body push/pull (with supersets), and a core circuit |
| `vinyasa-yoga.json` | Sun Salutation A rounds and a power flow with side-alternating superset sequences — hold a standing pose on one side, vinyasa (plank → chaturanga → cobra → down dog) through to the other side. includes a custom "Chaturanga" exercise (text-only in FIT export, no Garmin media). Plus an evening wind-down |
| `superset-circuits.json` | Three superset sessions in a "Superset Circuits" folder: a ~35-min full-body (arm+leg supersets, warm-up, core, foam-roll cooldown), a ~20-min HIIT cardio blast (three-exercise circuit), and a ~25-min kettlebell session |
| `pilates-and-recovery.json` | A ~15-min classical pilates core sequence and a ~20-min recovery day (yoga holds, per-side pigeon/hip-flexor via 2 sets, full foam-roll circuit) |
| `weekly-plan.json` | A sample recurring weekly template: workouts + daily meals (breakfast/lunch/snack/dinner) + a mind practice, demonstrating the meal-planning flow |

All exercises reference the built-in library, so Garmin media, descriptions, and `.fit` export work out of the box.

## JSON schema

Import files follow this shape (all sections optional — include what you need):

```jsonc
{
  "app": "health-tracker",          // marker, include as-is
  "sevV2": true,                    // severity scheme version, include as-is
  "woFolders": [                    // workout folders
    {"id": "fold01", "name": "My Folder", "open": true}
  ],
  "customEx": [                     // exercises not in the built-in library (EXLIB)
    {"n": "Chaturanga", "c": "yoga", "t": 1}   // t:1 = time-based; omit for reps
  ],
  "workouts": [
    {
      "id": "wo0001",               // unique, alphanumeric, stable (import dedupes by id)
      "folderId": "fold01",         // optional, must match a folder in this file
      "name": "My Workout",
      "exercises": [                // always include all seven fields
        {
          "n": "Goblet Squat",      // exact name from EXLIB or customEx
          "c": "squat",             // its category: squat lunge hinge push pull press
                                    //   arms core cardio yoga pilates mobility
          "mode": "reps",           // "reps" (sets×reps) or "time" (sets×secs)
          "sets": 3, "reps": 12, "secs": 30,   // fill the unused one with a default
          "rest": 60,               // seconds after each set, 0 for flows
          "grp": "grpa01"           // optional superset id (alphanumeric); shared-grp
        }                           //   exercises alternate set-by-set (A1 B1 A2 B2…)
      ]
    }
  ],
  "template": {                     // recurring weekly plan, keys "0" (Sun) … "6" (Sat)
    "1": [{"id": "it0001", "type": "meal", "title": "Lunch", "detail": "Quinoa bowl"}]
  },                                // type: "move" | "meal" | "mind"
  "goal": 45,                       // weekly orange-minute goal
  "tags": ["Headache"]              // health-check tags
}
```

To build and validate workouts or generate share links, use the `create-workout` skill (`.claude/skills/create-workout/`).
