# Returning to the people in Hearth

The three early campaigns now lead to optional follow-ups at their original contacts. Each follow-up requires the first campaign's final handover, then an actual conversation on foot with Mara Reed, Len Vale, or Ada Finch. Completing a campaign does not automatically accept another. All locations, site entrances, contacts, and physical objects are reused; Hearth's geography is unchanged.

The follow-ups retain the original decisions and reports. Their openings depend on those choices, their middle steps require physical work, and their final reports unlock a bounded personal agreement. Recurring conversation topics change as the follow-up advances. Returning to the medicine case, passage slip, freight register, or weather recorder shows the records this captain helped leave behind.

## The Next Shift

**After:** Night Shift, No Backup (`cold_chain`). **Contact:** Mara Reed. **Follow-up:** `cold_chain_aftercare`, six steps, 90 cr base completion reward.

The regulator still works. A new attendant disconnected the unfamiliar alarm because the repair card never explained whether its test would warm the medicine. Mara's opening refers to the clinic or workshop agreement the captain originally chose.

Read the attendant's note at the medicine case, test the alarm at the orchard valve manifold while keeping the case powered, and choose what support to leave. Verify the resulting handover at the case before reporting to Mara.

| Addition | Paid when chosen | Benefit after final handover |
| --- | --- | --- |
| Paid handover rota | 45 cr | Morrow infirmary discount becomes **35% total**. Any original hull-repair agreement remains. |
| Labeled spare regulator | 3 ore from the captain's own ship, physically docked at Morrow | Morrow hull-repair discount becomes **22% total**. Any original infirmary agreement remains. |

These rates replace the corresponding older rate; they are not multiplied or added to it. The other original service agreement remains at 25% infirmary or 15% hull repair, if the captain earned it. Choosing the support alone does not grant the improvement. Other ports and captains retain their own prices.

The case's final record includes the paid rota or spare's shelf location. Mara remembers the attendant asking questions and taking part in the handover, rather than announcing that the captain solved every clinic problem.

## The People in the Margin

**After:** A Fair Departure (`fair_departure`). **Contact:** Len Vale. **Follow-up:** `departure_aftercare`, six steps, 110 cr base completion reward.

The timetable works, but the charter covers a limited kind of journey. A clinic charter leaves out pump worker **Tamsin Roe**; a worker or courier charter leaves out patient **Eda Moss**. Read the rejected booking, hear Mara's account, then choose the revised terms with Len.

| Revision | Paid when chosen | Benefit after test journey and approval |
| --- | --- | --- |
| Open-seat reserve | 30 cr | The two Hearth fare types outside the original charter gain **+4 cr each**. The original supplement remains unchanged. |
| Narrow charter with clear terms | No contribution | The originally covered fare type gains **+2 cr more**. Other fare types retain their ordinary quote. |

The original supplement is patient +10 cr, commuter +6 cr, or courier +8 cr. Supplements are selected once per offer; the new +4 cr never stacks onto the already covered fare type.

The test is an actual passenger booking, not a receipt dialogue choice. While the follow-up is at its trial step, Kettle's existing Passage desk offers the named traveler a reserved trip to Morrow. It uses normal berth capacity, the accepted ship, the actual pickup and delivery desks, the quoted fare, and the usual clean-trip tip. Older or unrelated fare receipts cannot satisfy it. The named ticket and its terms survive saves and shared-realm restoration. Only authoritative delivery of that booking marks the proof flag.

Approval changes future offers. A booking accepted beforehand keeps its quoted fare and the support terms shown on its ticket, including after a reload. The rejected booking stays beside the completed receipt; the follow-up does not claim to replace the public passenger service or other captains' contracts.

## A Warning People Can Use

**After:** The Signal We Can Trust (`clear_signal`). **Contact:** Ada Finch. **Follow-up:** `signal_aftercare`, seven steps, 120 cr base completion reward.

The original publication determines the problem Ada raises:

- An open report exposed a passenger's journey in its appendix. Distributed copies cannot be recalled.
- A redacted report protected names but left the next watch unable to verify an anonymous source without Ada.
- A licensed report works, but its evidence is behind the existing license. The follow-up does not cancel that contract.

Inspect the report annotation at Kettle's passage slip and ask Len what the next watch can independently check. With Ada, choose a consent register for 20 cr or a free public station benchmark. The register separates permitted journey evidence from the public warning; the station benchmark verifies the clock without claiming to prove a passenger's journey.

Both paths require a **new flight reading** from the actual helm at the marked independent Hearth timing point, using **6 reactor charge**, followed by a physical evidence puzzle at the Northwatch recorder. The record compares a 10:00 departure and 10:03 arrival and limits the public claim to agreement between clocks. Ada's final handover reduces ordinary scans to **5 charge**. The original calibrated rate stays at 6 until that handover; story and Earth signal requirements retain their own rules.

The original publication choice remains in the saved campaign. The recorder and Ada's later conversation describe the new procedure while acknowledging that the earlier report still exists.

## Implementation and authority

`dist/local-aftermaths.mjs` defines the three follow-ups. They are appended by `buildLocalCampaigns`, but `LOCAL_CAMPAIGN_IDS` remains the three original early leads; `LOCAL_AFTERMATH_IDS` names the follow-ups separately. The existing campaign notebook renders their step counts, targets, choices, and consequences through `localCampaign` metadata.

`campaignStageText` resolves either the current campaign's choices or the original campaign named by `respondToThread`. Both the public view and the actual accepted dialogue use the same resolution. Optional contact topics and object inspection text are read-only views of the captain's progress, not mutations to shared scenery or another captain's story.

All task progression uses the existing authoritative `threadAction` checks: consciousness, current stage, actual contact or object, system and site, proximity, available credits, and supply-ship access. Ship readings use the existing helm and real-energy checks. No command accepts a client-supplied receipt, completion flag, fare price, or benefit. Final rewards use the normal once-only completed-quest transition. Save normalization recognizes the new quest IDs and valid choice IDs without converting an unfinished follow-up into an earned agreement.

Focused coverage is in `tests/local-aftermaths.test.mjs` and `tests/server/local-aftermaths.test.mjs`, alongside the existing local campaign, quest-rule, and dialogue regression tests. The tests exercise every original choice, all follow-up branches, physical and resource guards, rate bounds, old accepted quotes, named-booking proof, personal object views, persistence, duplicate actions, and independent captains in a shared realm.
