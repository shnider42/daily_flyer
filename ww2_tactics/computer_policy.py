"""Difficulty changes decisions, never dice, sight, stats or action budgets."""
import hashlib
import json


def eligible(state, unit):
    if not state.get('coop'):
        return True
    from .cooperative import group_for
    group = group_for(state, unit['id'])
    return bool(group and group['owner'] is None)


def choose(state, choices, threshold):
    if not state.get('coop'):
        if not choices:
            return dict(kind='end')
        score, action = max(choices, key=lambda item: item[0])
        return action if score > threshold else dict(kind='end')
    from .cooperative import group_for, transport_allowed
    ranked = []
    for score, action in choices:
        group = group_for(state, action.get('unit'))
        if not group or group['owner'] is not None or not transport_allowed(state, action, None) or score <= threshold:
            continue
        if group['difficulty'] == 'easy':
            # Reproducible imprecision, independent of the combat dice stream.
            # It chooses among plausible actions, with less emphasis on support
            # combinations; it never invents an illegal order or a skipped AP.
            key = json.dumps([state['round'], state['revision'], action], sort_keys=True)
            noise = int.from_bytes(hashlib.sha256(key.encode()).digest()[:4], 'big') / (2**32 - 1)
            score += noise * 6 - 3
            if action['kind'] in ('command', 'inspire', 'suppress', 'artillery', 'barrage'):
                score -= 3
        ranked.append((score, action))
    return max(ranked, key=lambda item: item[0])[1] if ranked else dict(kind='end')
