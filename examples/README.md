# Examples

Importable sample data in the app's export format (see `SPEC.md` → Data, import/export).

**How to import:** Settings (gear icon) → *Upload data* and pick a file — or *Paste data* and paste the file's contents. You'll be shown which sections the file contains and can choose what to import. Workouts and folders are added to yours (deduplicated by id, so importing a file twice won't create duplicates); importing the weekly plan example overwrites your recurring template.

| File | Contents |
|---|---|
| `seven-minute-workouts.json` | The NYT/ACSM 7-Minute Workout and the Advanced 7-Minute Workout, in a "7-Minute Workouts" folder |
| `strength-routines.json` | Full-body dumbbell, lower body & glutes, upper-body push/pull (with supersets), and a core circuit |
| `vinyasa-yoga.json` | Sun Salutation A rounds and a power flow with side-alternating superset sequences — hold a standing pose on one side, vinyasa (plank → chaturanga → cobra → down dog) through to the other side. "Push Up" in time mode stands in for chaturanga. Plus an evening wind-down |
| `weekly-plan.json` | A sample recurring weekly template: workouts + daily meals (breakfast/lunch/snack/dinner) + a mind practice, demonstrating the meal-planning flow |

All exercises reference the built-in library, so Garmin media, descriptions, and `.fit` export work out of the box.
