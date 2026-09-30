# Baseball dataset attribution and license

The Lahman Baseball Database is copyright 1996–2025 by SABR, via a generous
donation from Sean Lahman. Source: https://sabr.org/lahman-database/

The source database and the derived `baseball_2025.json.gz` dataset are licensed
under Creative Commons Attribution-ShareAlike 3.0 Unported:
https://creativecommons.org/licenses/by-sa/3.0/

Original licensing contact: Scott Bush, sbush@sabr.org.
General source contact: lahmandb@sabr.org.

Changes made for this study: select AL/NL statistics; aggregate player/team
stints into seasons; calculate rate statistics and combined-league baselines;
identify first substantial seasons; retain the study cohort; arrange compact
records. These changes and the derived database are offered under the same
CC BY-SA 3.0 license. No endorsement by SABR or Sean Lahman is implied.

The unmodified source tables were downloaded from this pinned distribution
mirror of SABR's CSV release (1871–2025):
https://github.com/cbwinslow/lahman-database-csv/tree/0377e0b8d3f1b8f6710cc4faee7d842d0e81f344/data

The official readme was separately retrieved from SABR's linked download and
its copyright and license notice were checked. `baseball_sources.json` records
SHA-256 hashes of all CSV inputs. `scripts/build_baseball_data.py` reproduces
the derived snapshot from those CSVs. Neither the build nor the website scrapes
Baseball-Reference. Baseball-Reference links use the IDs supplied in Lahman's
People table and are provided only for further reading.
