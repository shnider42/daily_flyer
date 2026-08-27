# E46 Owner Companion

Experimental Daily Flyer vertical for a 2004 BMW E46 330Ci (M54B30).

## Goal

Create one owner-facing place that helps a relatively new DIY owner:

1. get a currently broken car running again,
2. diagnose from symptoms instead of guessing common failures,
3. connect tests to repairs and "while you're in there" work,
4. establish a known maintenance/reliability baseline, and
5. learn how the car works while maintaining it as a daily driver.

## Run it

Use the standard Daily Flyer web app with:

`/?theme=e46_owner_companion`

No web routing changes are required because `web.py` already resolves theme names dynamically.

## Current first slice

The theme currently includes:

- fixed vehicle context for a 2004 BMW 330Ci / E46 coupe / M54B30,
- explicit current status that the car is out of service,
- an interactive symptom triage card,
- initial paths for overheating, coolant loss, oil leaks, and crank/no-start behavior,
- E46-specific cards for the cooling-system failure family, water pump, and valve-cover gasket,
- "check before parts" guidance,
- "while you're in there" guidance,
- a phase-two daily-driver reliability baseline, and
- source-quality / trust-layer guidance.

## Diagnostic principle

The companion should preserve this chain for every repair:

`symptom -> evidence/test -> diagnosis -> parts/procedure -> verification`

Common E46 failures should influence ranking, but should not replace diagnosis.

## Next architectural step

The static theme is intentionally the smallest useful vertical slice. The next step should be moving vehicle state and troubleshooting knowledge out of presentation code into structured models/stores so the application can remember one specific car.

Likely future entities:

- `VehicleProfile`
- `Symptom`
- `DiagnosticCheck`
- `FailureMode`
- `RepairProcedure`
- `Part`
- `MaintenanceEvent`
- `SourceReference`

That enables future features such as maintenance history, mileage-aware recommendations, fault-code intake, repair records, parts/fitment references, confidence-ranked troubleshooting, and a personalized daily-driver plan.

## Source philosophy

The eventual aggregator should distinguish source roles rather than treating every URL equally:

- BMW technical / vehicle-specific information: primary authority where available
- parts diagrams / fitment: relationship and fitment reference
- trusted repair manual / BMW specialist procedure: repair sequence and specifications
- E46 community sources: failure patterns, practical experience, and edge cases
- Owner Companion: orchestration layer tying symptoms, evidence, repairs, history, and sources together

## Safety boundary

The site should flag conditions where continued driving or casual testing can create additional damage or injury, especially overheating, brake/steering faults, fuel leaks, severe fluid loss, and work around a hot/pressurized cooling system. Critical specifications must be verified against an authoritative repair source before work begins.
