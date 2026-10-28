"""Bounded, self-contained solo operations with immutable mission starts.

The private context travels with an ordinary match/checkpoint. It contains no
credentials or external match dependencies. Only ``summary`` and previously
redacted review boards may cross the player boundary.
"""
import copy
import secrets


KEY = '_operation'
VERSION = 1
ID = 'greybridge'
NAME = 'Operation Greybridge'
STAGES = ('raid', 'crossing', 'hold', 'withdrawal')
SCENARIOS = {stage: 'current:greybridge_' + stage for stage in STAGES}
BRIEFINGS = {
    'raid': 'Bring at least two raiding teams out. Disabling the relay is optional; it delays the German reserve in the crossing mission even if this raid ends in defeat.',
    'crossing': 'Secure the Greybridge crossing. Success leads to a bridgehead defense; defeat leads to a fighting withdrawal.',
    'hold': 'Hold the bridgehead against the counterattack to complete the operation.',
    'withdrawal': 'Bring the force out after the failed crossing. A successful withdrawal saves the force, but does not secure the bridge.',
}
OBJECTIVES = {
    'raid': 'Extract two infantry teams by the end of round 10. Relay sabotage is optional.',
    'crossing': 'Hold the north-bank depot for two consecutive American turn endings by the end of round 12.',
    'hold': 'Hold the north-bank depot for four consecutive American turn endings by the end of round 8.',
    'withdrawal': 'Extract four infantry teams by the end of round 10.',
}


def enabled(state):
    context = state.get(KEY)
    return isinstance(context, dict) and context.get('id') == ID and context.get('version') == VERSION


def without_context(state):
    """Keep frozen campaign data out of per-order copies and takeback journals."""
    return {key: value for key, value in state.items() if key != KEY}


def create(initial_factory):
    from . import greybridge
    templates = {}
    for stage, scenario in SCENARIOS.items():
        base = initial_factory(scenario, 'dsl')
        base.update(ready=True, ai_side='de', created_side='us', pipeline_version=2,
                    team_assignment={'method': 'selected', 'creator_side': 'us'})
        # Generate the map/weather once. Both consequence variants share that
        # setup; future transitions never regenerate it from the live catalog.
        templates[stage] = {}
        for relay in (False, True):
            start = greybridge.configure(copy.deepcopy(base), {'relay_disabled': relay})
            start.pop(KEY, None)
            templates[stage]['relay' if relay else 'normal'] = start
    first = copy.deepcopy(templates['raid']['normal'])
    first[KEY] = dict(id=ID, version=VERSION, run_id=secrets.token_hex(16),
                      stage='raid', attempt=1, inherited={'relay_disabled': False},
                      templates=templates, initial=copy.deepcopy(first), history=[])
    return first


def next_stage(state):
    if not enabled(state) or not state.get('winner'):
        return None
    stage = state[KEY]['stage']
    if stage == 'raid':
        return 'crossing'
    if stage == 'crossing':
        return 'hold' if state['winner'] == 'us' else 'withdrawal'
    return None


def _relay(state):
    context = state[KEY]
    if context['stage'] == 'raid':
        return bool(state.get('greybridge', {}).get('relay_disabled'))
    return bool(context.get('inherited', {}).get('relay_disabled'))


def _title(state, stage=None):
    context = state[KEY]
    if stage is None or stage == context['stage']:
        return state['battlefield']['name']
    return context['templates'][stage]['normal']['battlefield']['name']


def _facts(state):
    """Authored, public consequences; never inspect an enemy roster."""
    if not state.get('winner'):
        return dict(what_happened='', what_changes='', next_task='')
    stage = state[KEY]['stage']
    relay = _relay(state)
    reason = state.get('greybridge', {}).get('outcome_reason')
    if state.get('resigned_by'):
        reason = 'You conceded this mission.'
    if not reason:
        reason = 'Mission won.' if state['winner'] == 'us' else 'Mission lost.'
    if stage == 'raid':
        relay_result = 'The relay was disabled.' if relay else 'The relay remained operational.'
        return dict(what_happened=reason + ' ' + relay_result,
                    what_changes=('The crossing reserve arrives in round 6 instead of round 4.' if relay else
                                  'The crossing reserve arrives on its normal round 4 schedule.'),
                    next_task='Secure the Greybridge crossing with a replenished force.')
    if stage == 'crossing':
        held = state['winner'] == 'us'
        return dict(what_happened=reason,
                    what_changes=('The bridgehead is secured; the next mission is its defense.' if held else
                                  'The crossing was not secured; the next mission is a fighting withdrawal.'),
                    next_task=('Hold the bridgehead against the counterattack.' if held else
                               'Extract the force from the fallback position.'))
    if stage == 'hold':
        return dict(what_happened=reason,
                    what_changes=('The bridge is secured and the operation succeeds.' if state['winner'] == 'us' else
                                  'The bridgehead was lost; the operation objective was not achieved.'),
                    next_task='Review the operation or retry this final mission.')
    return dict(what_happened=reason,
                what_changes=('The withdrawal succeeded, but the bridge objective remains unfulfilled.' if state['winner'] == 'us' else
                              'The withdrawal failed and the bridge objective remains unfulfilled.'),
                next_task='Review the operation or retry this final mission.')


def force_record(state):
    """Own unit-counter losses, remaining teams and extractions are distinct."""
    from . import debrief
    own = debrief.summary(state, 'us')
    if own is None:
        return None
    losses = own.get('statistics', {}).get('losses')
    return dict(units_lost=sum(losses.values()) if isinstance(losses, dict) else None,
                units_remaining=own['surviving_units'], units_extracted=own['evacuated'],
                complete=bool(own.get('complete')))


def record(state, index):
    context = state[KEY]
    return dict(index=index, stage=1 if context['stage'] == 'raid' else 2 if context['stage'] == 'crossing' else 3,
                title=_title(state), result='victory' if state['winner'] == 'us' else 'defeat',
                round=state['round'], force_record=force_record(state), **_facts(state))


def summary(state):
    if not enabled(state):
        return None
    context = state[KEY]
    stage = context['stage']
    transition = context.get('transition') or {}
    finished = bool(state.get('winner'))
    terminal = stage in ('hold', 'withdrawal')
    completed = finished and terminal
    won = completed and stage == 'hold' and state['winner'] == 'us'
    outcome = ('operation_success' if won else 'objective_failed') if completed else None
    outcome_label = ('Bridge secured — operation complete.' if won else
                     'Withdrawal complete — bridge objective not achieved.' if completed and stage == 'withdrawal' and state['winner'] == 'us' else
                     'Operation complete — bridge objective not achieved.' if completed else '')
    board = state['battlefield']
    briefing = board.get('operation_briefing') or BRIEFINGS[stage]
    objective = board.get('objective_description') or board.get('brief') or OBJECTIVES[stage]
    if not isinstance(objective, str):
        objective = OBJECTIVES[stage]
    return dict(id=ID, name=NAME, version=context['version'],
                stage=1 if stage == 'raid' else 2 if stage == 'crossing' else 3,
                mission_title=_title(state), briefing=briefing, objective=objective,
                inherited=dict(relay_disabled=_relay(state),
                               reserve_round=(6 if _relay(state) else 4) if stage in ('raid', 'crossing') else None),
                history=[copy.deepcopy(item['record']) for item in context.get('history', [])],
                can_continue=bool(finished and not terminal and not transition),
                can_retry=bool(finished and not transition),
                next_code=transition.get('code'), next_action=transition.get('action'),
                completed=completed, outcome=outcome, outcome_label=outcome_label,
                force_record=force_record(state),
                **_facts(state))


def review_snapshot(public):
    """Retain one already-redacted final board, never another operation tree."""
    result = copy.deepcopy({key: value for key, value in public.items()
                            if key not in (KEY, 'operation', 'computer_playback', 'computer_work',
                                           'code', 'state_hash', 'state_transport')})
    result.update(readonly=True, legal={}, computer_playback=None,
                  order_history=dict(can_undo=False, can_redo=False, redo_required=False,
                                     undo_label='', redo_label='', reason='This is a completed mission review.'))
    return result


def transition(state, action, public=None):
    """Build the successor; the caller commits both rows in one transaction."""
    if not enabled(state):
        raise ValueError('This battle is not part of a linked operation.')
    context = state[KEY]
    if context.get('transition'):
        raise ValueError('This mission already has a continuation.')
    if not state.get('winner'):
        raise ValueError('Finish this mission before continuing or retrying.')
    if action not in ('continue', 'retry'):
        raise ValueError('Choose Continue operation or Retry mission.')
    updated = copy.deepcopy(context)
    updated.pop('transition', None)
    if action == 'retry':
        successor = copy.deepcopy(context['initial'])
        updated['attempt'] = int(context.get('attempt', 1)) + 1
    else:
        stage = next_stage(state)
        if stage is None:
            raise ValueError('This operation has ended. Review it or retry the final mission.')
        if public is None:
            raise ValueError('A private mission review is required before continuing.')
        prior = updated.get('history', [])
        if len(prior) >= 2:
            raise ValueError('The operation already contains its completed missions.')
        prior.append(dict(record=record(state, len(prior)), state=review_snapshot(public)))
        updated['history'] = prior
        inherited = {'relay_disabled': _relay(state)}
        successor = copy.deepcopy(context['templates'][stage]['relay' if inherited['relay_disabled'] else 'normal'])
        updated.update(stage=stage, attempt=1, inherited=inherited,
                       initial=copy.deepcopy(successor))
    successor[KEY] = updated
    return successor


def restored(state):
    """SAVE creates a distinct run with no route back to the source continuation."""
    if not enabled(state):
        return state
    state = copy.deepcopy(state)
    state[KEY]['run_id'] = secrets.token_hex(16)
    state[KEY].pop('transition', None)
    return state


def history_item(state, index):
    if not enabled(state):
        raise ValueError('This battle is not part of a linked operation.')
    history = state[KEY].get('history', [])
    if type(index) is not int or not 0 <= index < len(history):
        raise ValueError('That completed mission is unavailable.')
    return copy.deepcopy(history[index])
