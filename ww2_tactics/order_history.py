"""Private, turn-local takebacks. Redo restores results, never reruns the engine."""
import copy
import secrets

from .engine import apply
from .computer import play_turn
from .visibility import fog, visible_ids
from .buildings import revealed
from . import fieldworks, signals

KEY = '_order_history'
LIMIT = 20


def resign(state, side):
    """Concede from either turn, committing all orders and awarding one win."""
    if side not in ('us', 'de') or not state['ready'] or state.get('winner'):
        raise ValueError('Only an active battle can be resigned.')
    result = copy.deepcopy({key: value for key, value in state.items() if key != KEY})
    winner = 'de' if side == 'us' else 'us'
    result.update(winner=winner, resigned_by=side, revision=state['revision'] + 1)
    result.pop('rematch', None)
    result.setdefault('victories', {'us': 0, 'de': 0})[winner] += 1
    names = result.get('factions', {'us': 'Americans', 'de': 'Germans'})
    message = f"{names.get(side, side)} resigned. {names.get(winner, winner)} win the battle."
    result['log'].append(message)
    for team in ('us', 'de'):
        report = result.setdefault('reports', {}).setdefault(team, {'log': [], 'combat': []})
        report['log'].append(message)
    result[KEY] = dict(side=side, past=[], future=[], reason='The battle ended by resignation.')
    return result


def status(state, side):
    history = state.get(KEY, {})
    own = history.get('side') == side and state['turn'] == side
    ready = own and state['ready'] and not state.get('rematch')
    past, future = history.get('past', []), history.get('future', [])
    locked = any(item['rolled'] for item in future)
    return dict(can_undo=bool(ready and past), can_redo=bool(ready and future),
                redo_required=bool(ready and locked),
                undo_label=past[-1]['label'] if ready and past else '',
                redo_label=future[-1]['label'] if ready and future else '',
                reason='Resolve the next-battle proposal first.' if state.get('rematch') else
                'Redo resolved dice before giving different orders.' if ready and locked else
                history.get('reason', 'Undo is available after an order, during your turn.'))


def perform(state, side, action):
    """Keep the immutable last-turn movie out of per-order engine/journal copies.

    A turn's replay is not gameplay state and cannot change between takebacks.
    Old saves may have repeated it in every snapshot; normalize those entries
    without mutating the caller. The complete replay remains at the state root.
    """
    if action.get('kind') == 'resign':
        # Resignation intentionally discards even incomplete/locked journals.
        return resign(state, side)
    had_replay = 'computer_playback' in state
    replay = state.get('computer_playback')
    current = {key: value for key, value in state.items() if key != 'computer_playback'}
    if KEY in current:
        history = dict(current[KEY])
        for stack in ('past', 'future'):
            history[stack] = [dict(item, snapshot={key: value for key, value in item['snapshot'].items()
                                                 if key != 'computer_playback'})
                              for item in history.get(stack, [])]
        current[KEY] = history
    result = _perform(current, side, action)
    # End turn may have generated a NEW movie. Never overwrite it with the old.
    if had_replay and 'computer_playback' not in result:
        result['computer_playback'] = replay
    return result


def _perform(state, side, action):
    if action.get('kind') == 'resign':
        return resign(state, side)
    # Journal entries are immutable snapshots. Copy the stacks, not every prior
    # battlefield on every order; apply() already copies the current battlefield.
    raw = state.get(KEY, {})
    history = dict(raw, past=list(raw.get('past', [])), future=list(raw.get('future', [])))
    state = {key: value for key, value in state.items() if key != KEY}
    if history.get('side') != side:
        history = dict(side=side, past=[], future=[])
    kind = action.get('kind')
    if kind in {'undo', 'redo'}:
        available = status(dict(state, **{KEY: history}), side)
        if not available['can_' + kind]:
            raise ValueError('No order available to ' + kind + '. ' + available['reason'])
        source, destination = ('past', 'future') if kind == 'undo' else ('future', 'past')
        item = history[source].pop()
        history[destination].append(dict(snapshot=state, label=item['label'], rolled=item['rolled']))
        restored = copy.deepcopy(item['snapshot'])
        restored['revision'] = state['revision'] + 1
        restored[KEY] = history
        return restored
    if any(item['rolled'] for item in history.get('future', [])):
        raise ValueError('Redo resolved dice before giving different orders. Undo cannot reroll combat.')
    dice = []
    def roll():
        value = secrets.randbelow(6) + 1
        dice.append(value)
        return value
    result = apply(state, side, action, roll=roll)
    if kind == 'end':
        result = play_turn(result)
        result[KEY] = dict(side=result['turn'], past=[], future=[], reason='A turn ended. Earlier orders are committed.')
        return result
    # Scouting information is irreversible, even in solo. Test both armies so an
    # undo cannot hide a unit that the other browser has already discovered.
    reveals = fog(state) and any(visible_ids(result, team) - visible_ids(state, team)
                                for team in ('us', 'de'))
    if (state.get('air_version') or state.get('joint_ops_version')) and not reveals:
        # Flight legs may reveal a contact briefly, then leave sight before the
        # destination. Remembered information must not be erased by takebacks.
        reveals = any(contact.get('pos') != state.get('intel',{}).get(team,{}).get(uid,{}).get('pos')
                      for team in ('us','de') for uid,contact in result.get('intel',{}).get(team,{}).items())
    if reveals or revealed(state, result) or fieldworks.revealed(state, result) or signals.revealed(state,result) or kind in {'recon', 'field_recon', 'radio_update', 'observe', 'airborne_drop', 'mark_lz'}:
        result[KEY] = dict(side=side, past=[], future=[], reason='New sighting or search: earlier orders are committed.')
    else:
        label = {'move':'Move', 'dig':'Dig in', 'inspire':'Rally nearby', 'command':'Give actions',
                 'drop':'Airborne landing', 'end':'End turn', 'load_ammo':'Change ammunition',
                 'repair_tracks':'Repair tracks', 'bombard':'Area bombardment', 'artillery':'Call artillery',
                 'field_recon':'Recon plane', 'repair_tank':'Engineer repair',
                 'snipe':'Aimed sniper shot', 'area_fire':'Fire at hex'}.get(kind, str(kind).capitalize())
        history.setdefault('past', []).append(dict(snapshot=state, label=label, rolled=bool(dice)))
        history['past'] = history['past'][-LIMIT:]
        history.update(future=[], reason='Undo recent orders this turn. Resolved dice must be redone before changing orders.')
        result[KEY] = history
    return result
