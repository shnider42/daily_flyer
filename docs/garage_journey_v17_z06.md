# Garage Journey v17 — 2024 Corvette Z06 2LZ

Feature branch: `agent/garage-recovery`. Starting remote HEAD verified as
`cc4562e06f4e9466eaa055f3b677e93cb0bd4f2b` on 2026-09-27.

## Scope

`garage_journey_v17` extends v16 and appends `corvette_c8_z06_2024` without
mutating the existing vehicle list. Both inherited marker functions recognize
Z06. Existing membership/profile/onboarding keys and all earlier theme modules
are unchanged. No additional MutationObserver, caching, compression, renderer,
asset-externalization or deployment changes are introduced.

The Garage aliases now resolve to v17; `corvette_z06_workshop` resolves to
`corvette_c8_z06_2024`. An explicit `garage_journey_v16` URL still renders v16.
The new Workshop reuses the existing system/component/search interaction design
in its own module. It provides eight systems and seven LT6 component pages.

## Configuration

Confirmed by the requested definition: 2024 Chevrolet Corvette Z06, C8, 2LZ,
Red Mist Metallic Tintcoat, LT6 5.5L naturally aspirated flat-plane-crank V8,
670 hp / 460 lb-ft, eight-speed DCT, RWD. Default Garage membership is false.

Unconfirmed: VIN, mileage, body style, interior color, Z07, carbon-ceramic brakes,
carbon-fiber wheels, aero package, front lift, modifications and service history.
These are explicitly unknown; photos never establish the owner's equipment.
The normal Garage profile remains available with its existing fields.

## Technical references

- [Chevrolet 2024 Z06 fact sheet, August 23, 2023](https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/Chevrolet/Cars/Corvette_Z06/2024/2024-Chevrolet-Corvette-Z06-082323.pdf): model-year engine/output/DCT, DOHC/flat-plane design, trim/body choices and optional Z07 content.
- [GM 2024 US Corvette order guide, July 7, 2023](https://www.corvetteblogger.com/docs/2024CorvetteOrderGuide_070723.pdf): GM-authored original hosted by CorvetteBlogger; Z06 equipment groups, PDR, FE6/FE7, eLSD/PTM, wheels, LT6 and performance exhaust. Distinguishes Z06 from Stingray and E-Ray.
- [GM 2024 Corvette Owner's Manual, June 24, 2023 revision](https://www.corvetteblogger.com/docs/2024CorvetteOwnersManual.pdf): GM-authored original hosted by CorvetteBlogger. Relevant printed sections include PDR (130), track events (160), DCT (183), driver modes (195), 5.5L oil (248), transmission fluid/filter (252), cooling and overheating, and service/maintenance (314). PDF page numbering differs from printed page numbers.
- [GM 2023 Z06 engineering launch release](https://media.chevrolet.com/media/us/en/chevrolet/home.detail.html/content/Pages/news/us/en/2021/oct/1026-corvette-z06.html): LT6 architecture background only, clearly labeled as 2023 rather than used to prove 2024 equipment. Covers crankshaft, heads, intake, six-stage lubrication, cooling and exhaust.
- [Chevrolet manuals](https://www.chevrolet.com/support/vehicle/manuals-guides): select 2024 and Corvette for official owner-support access.
- [ACDelco TDS](https://www.acdelcotds.com/): authoritative VIN/configuration-specific service information; subscription may be required.
- [NHTSA recalls](https://www.nhtsa.gov/recalls): live VIN lookup, not a claim of any open recall on this vehicle.

Factory reference facts and general diagnostic guidance are visually separated.
No fabricated torque values, part numbers or repair procedures are included.
Enthusiast reports are not presented as verified defects.

## Photographs and rights

Credit: **Chevrolet / General Motors (GM Design)**. Original GM press JPEGs,
visually inspected. The three files returned HTTP 200, `image/jpeg`, including
requests with an external site Referer. They have no expiring URL parameters.

These are **representative 2023 launch-year C8 Z06 photos**, not photographs of
a verified 2024 2LZ or the owner's specific car. Exterior paint is Red Mist
Metallic Tintcoat. The convertible body, upholstery and pictured options must
not be inferred as the owner's configuration. This qualification is visible in
the vehicle gallery, with a source link.

| Use | Original GM file | Dimensions | Description |
| --- | --- | --- | --- |
| Builder, owned card, detail hero, gallery | [2023-Chevrolet-Corvette-Z06-012.jpg](https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/Chevrolet/Cars/Corvette_Z06/2023/Product/Vehicle/2023-Chevrolet-Corvette-Z06-012.jpg) | 5697 × 3800 | Rear three-quarter driving photograph of Red Mist Z06 convertible |
| Second exterior | [2023-Chevrolet-Corvette-Z06-013.jpg](https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/Chevrolet/Cars/Corvette_Z06/2023/Product/Vehicle/2023-Chevrolet-Corvette-Z06-013.jpg) | 5700 × 3800 | Red Mist Z06 rear deck/spoiler/bodywork detail |
| Representative interior | [2023-Chevrolet-Corvette-Z06-014.jpg](https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/Chevrolet/Cars/Corvette_Z06/2023/Product/Vehicle/2023-Chevrolet-Corvette-Z06-014.jpg) | 5700 × 3800 | Overhead cockpit view with tan upholstery; interior color unconfirmed |

[Press source](https://media.chevrolet.com/media/us/en/chevrolet/home.detail.html/content/Pages/news/us/en/2021/oct/1026-corvette-z06.html).
Copyright remains with GM. An unrestricted reuse/redistribution license for
these specific assets was **not verified**. They are linked remotely with credit,
not copied into the repository or represented as Creative Commons/public domain.
Remote availability remains dependent on GM. Obtain explicit permission or use
owner-supplied licensed photography before republishing the images as local
assets or using them commercially. No dealership or generated substitute is used.

All surfaces retain real `<img>` elements, eager initial loads, descriptive alt
text, object-fit and established card sizing. Gallery images use a 3:2 aspect
ratio. A failed C8 image displays a neutral Z06/Red Mist text fallback; it never
selects another Corvette photograph. The handler also clears failure state when
the shared detail image is reused for another car.

## Verification

Run only the feature checks: `python -m unittest discover -s tests -p test_corvette_z06_theme.py`.
They verify unchanged previous catalog data, seven unique keys, storage/observer
invariants, Workshop templates and search coverage, and successful Garage/C4/Z/
Z06 route rendering. Python compilation and rendered inline JavaScript syntax
are checked separately with `node --check`.

DOM interaction checks also passed for Builder selection, membership save/reload,
Z06 marker/gallery, image error/load recovery, profile saving without overwriting
C4 data, removal retaining the C8 profile, all requested search terms, component
navigation and return to the system index, with no JavaScript errors.

Visual browser QA could not run: Chromium is absent in the execution environment
and the browser downloads failed. DOM checks do not validate physical layout,
CSS scrolling, image decode in Safari, or actual iPhone behavior.

After deployment on desktop and iPhone:

1. Open Manage Garage before adding Z06: check the image, scrolling to the seventh
   entry, long-name wrapping, selection and Save/Cancel visibility.
2. Add it, open the owned card, and inspect hero/gallery, Workshop and bottom nav.
3. Save a nickname/mileage; reload, remove and re-add the car. Confirm its profile
   and the six existing vehicle profiles remain intact.
4. Search LT6, dry sump, DCT, eLSD, Mag Ride, PTM, overheating, misfire, oil pressure,
   brake vibration and PDR. Open a result and an LT6 component; use System index,
   Back and Garage Home.
5. Confirm the Garage landing page has no floating navigation and the profile/
   Builder modals scroll without background jumps or content hidden by controls.
