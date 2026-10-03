"""Army assignment at creation; existing database columns remain army seats."""
import secrets


def assignment(body):
    method = body.get('team_assignment', 'selected')
    side = body.get('side', 'us')
    if method not in ('selected', 'random', 'coin_flip'):
        raise ValueError('Choose selected armies, random armies, or a coin flip.')
    if side not in ('us', 'de'):
        raise ValueError('Choose one of the two armies.')
    result = {'method': method}
    if method in ('random', 'coin_flip'):
        toss = secrets.randbelow(2)
        side = 'us' if toss == 0 else 'de'
        if method == 'coin_flip':
            result['coin'] = 'heads' if toss == 0 else 'tails'
    result['creator_side'] = side
    return result


def seats(state, owner, computer=None):
    """host stores Allies and guest stores Axis, independent of who created it."""
    other = computer if state.get('ai_side') else None
    return (owner, other) if state.get('created_side', 'us') == 'us' else (other, owner)


def carry_creator(old, new, swap):
    # Old invitations keep their existing American-seat reset authority.
    if 'created_side' not in old:
        return
    side = old['created_side']
    new['created_side'] = ('de' if side == 'us' else 'us') if swap else side


def result_summary(state):
    """A public result reason derived from authoritative state, never unit counts."""
    winner = state.get('winner')
    if not winner:
        return None
    board = state['battlefield']
    loser = 'de' if winner == 'us' else 'us'
    if state.get('resigned_by'):
        reason = 'The opposing commander resigned.'
    elif state.get('front_mode') == 'evacuation':
        if winner == 'us':
            reason = ('The required six infantry units were evacuated.' if state.get('evacuated_count', 0) >= board['evacuation_target'] else 'The opposing army was eliminated.')
        elif not any(u['hp'] > 0 and u['side'] == 'us' and u['kind'] == 'landing_craft' for u in state['units']):
            reason = 'The evacuation force lost all of its rescue boats.'
        elif state.get('evacuated_count', 0) + sum(u['hp'] > 0 and u.get('evacuee', False) for u in state['units']) < board['evacuation_target']:
            reason = 'The required evacuation total is no longer reachable.'
        elif not any(u['hp'] > 0 and u['side'] == loser for u in state['units']):
            reason = 'The opposing army was eliminated.'
        else:
            reason = 'The evacuation deadline passed before six units were rescued.'
    elif state.get('air_version'):
        reason = ('Both RAF sector stations were destroyed.' if winner == 'de' else
                  'Every enemy bomber was destroyed.' if not any(u['hp'] > 0 and u['side'] == 'de' and u['kind'] == 'bomber' for u in state['units']) else
                  'At least one RAF sector station survived the final round.')
    elif state.get('naval_version'):
        reason = ('The fleet reached six control points.' if state['sea_score'][winner] >= 6 else
                  'The opposing fleet lost all its carriers.' if not any(u['hp'] > 0 and u['side'] == loser and u['kind'] == 'carrier' for u in state['units']) else
                  'The round limit was reached. Control points, then remaining hull strength, decided the result; Japan wins an exact tie.')
    elif not any(u['hp'] > 0 and u['side'] == loser for u in state['units']):
        reason = 'The opposing army was eliminated.'
    elif state.get('front_mode') == 'armored_control' or state.get('joint_ops_version'):
        score = state.get('front_score') or state['joint_score']
        reason = ('Ten control points secured the battle.' if score[winner] >= 10 else
                  'The round limit was reached. Higher control score wins; the Axis wins an exact tie.')
    else:
        reason = ('The required objectives were held through two consecutive Allied turn endings.' if winner == 'us' else
                  'The defenders held out until the round limit.')
    return {'winner': winner, 'reason': reason, 'round': min(state['round'], board['rounds'])}
