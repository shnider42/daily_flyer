"""Private, turn-local takebacks. Redo restores results, never reruns the engine."""
import copy
import secrets

from .engine import apply
from .computer import play_turn
from .visibility import fog, visible_ids

KEY = '_order_history'
LIMIT = 20


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
    if reveals or kind == 'recon':
        result[KEY] = dict(side=side, past=[], future=[], reason='New sighting or search: earlier orders are committed.')
    else:
        label = {'move':'Move', 'dig':'Dig in', 'inspire':'Rally nearby', 'command':'Give actions',
                 'drop':'Airborne landing', 'end':'End turn'}.get(kind, str(kind).capitalize())
        history.setdefault('past', []).append(dict(snapshot=state, label=label, rolled=bool(dice)))
        history['past'] = history['past'][-LIMIT:]
        history.update(future=[], reason='Undo recent orders this turn. Resolved dice must be redone before changing orders.')
        result[KEY] = history
    return result
