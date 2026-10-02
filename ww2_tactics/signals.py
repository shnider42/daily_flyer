"""Optional platoon intelligence and specialist orders, with immutable radio reports."""
import copy
from . import domains
from .visibility import active, sight_cache, sight_reader, unit_sees_hex

VERSION=1
ORDERS={'radio_update','observe','conceal','mortar_fire','demolition'}
SPECIALISTS={'radioman','commando','mountain','partisan','askari','mortar'}


def enabled(state):return state.get('signals_version')==VERSION


def initialize(state):
    if not state['battlefield'].get('signals'):return state
    state.update(signals_version=VERSION,platoon_intel={'us':{},'de':{}},radio_reports={'us':{},'de':{}})
    for u in state['units']:
        if u['kind'] in {'engineer','commando'}:u.setdefault('demolition_charges',1)
    observe_intel(state)
    return state


def group(u):return u.get('platoon') or 'HQ'


def group_sees(state,side,platoon,pos,concealed=False):
    from .engine import distance
    if not state.get('fog_of_war'):return True
    cache=sight_cache(state);key=('platoon_hex',side,platoon,tuple(pos),concealed)
    if cache is not None and key in cache:return cache[key]
    scouts_key=('platoon_scouts',side,platoon)
    scouts=cache.get(scouts_key) if cache is not None else None
    if scouts is None:
        scouts=[u for u in state['units'] if u['side']==side and group(u)==platoon and active(u)]
        if cache is not None:cache[scouts_key]=scouts
    # A purchased aerial search is already an army-level intelligence operation.
    result=any(r['side']==side and distance(r['pos'],pos)<=r['radius'] for r in state.get('recon',[])) or any(unit_sees_hex(state,u,pos,concealed) for u in scouts)
    if cache is not None:cache[key]=result
    return result


def concealed(state,u):
    from .engine import terrain
    from .fieldworks import CONCEALMENT
    if domains.joint(state) and domains.is_air(u):return 'air'
    if u.get('camouflaged') and not u.get('exposed_turns'):return 'camouflaged'
    return not u.get('armor') and not u.get('exposed_turns') and (u.get('camouflaged') or terrain(*u['pos'],state) in CONCEALMENT)


def group_ids(state,side,platoon):
    cache=sight_cache(state);key=('platoon_ids',side,platoon)
    if cache is not None and key in cache:return cache[key]
    result={u['id'] for u in state['units'] if u['side']==side or active(u) and group_sees(state,side,platoon,u['pos'],concealed(state,u))}
    if cache is not None:cache[key]=result
    return result


def contact(state,u):
    return dict(id=u['id'],side=u['side'],kind=u['kind'],pos=list(u['pos']),last_seen_round=state['round'],last_seen_turn=state['turn'])


@sight_reader
def observe_intel(state):
    if not enabled(state):return
    from .fieldworks import CONCEALMENT
    from .engine import terrain
    for side in ('us','de'):
        for platoon in {group(u) for u in state['units'] if u['side']==side}:
            memory=state.setdefault('platoon_intel',{}).setdefault(side,{}).setdefault(platoon,{})
            for uid,c in list(memory.items()):
                if group_sees(state,side,platoon,c['pos'],'air' if domains.joint(state) and domains.is_air(c) else terrain(*c['pos'],state) in CONCEALMENT):del memory[uid]
            seen=group_ids(state,side,platoon)
            for u in state['units']:
                if u['side']!=side and u['id'] in seen and active(u):memory[u['id']]=contact(state,u)


def reports_for(state,side):
    return [copy.deepcopy(c) for c in state.get('radio_reports',{}).get(side,{}).values() if state['round']<c['expires_round']]


@sight_reader
def public_views(state,side):
    board=state['battlefield'];result={}
    for platoon in sorted({group(u) for u in state['units'] if u['side']==side}):
        seen=group_ids(state,side,platoon)
        contacts=dict(state.get('platoon_intel',{}).get(side,{}).get(platoon,{}))
        for report in reports_for(state,side):
            if report['id'] not in contacts or report['last_seen_round']>=contacts[report['id']]['last_seen_round']:contacts[report['id']]=report
        # Looking at an old report's hex clears its marker without looking up
        # the target's secret current location or revealing its survival.
        remembered=[copy.deepcopy(c) for uid,c in contacts.items() if uid not in seen and not group_sees(state,side,platoon,c['pos'],'air' if domains.joint(state) and domains.is_air(c) else True)]
        result[platoon]=dict(enemy_ids=[u['id'] for u in state['units'] if u['side']!=side and u['id'] in seen],contacts=remembered,
            visible_hexes=[[x,y] for y in range(board['height']) for x in range(board['width']) if group_sees(state,side,platoon,[x,y])])
        if domains.joint(state):
            result[platoon]['visible_air_hexes']=[[x,y] for y in range(board['height']) for x in range(board['width']) if group_sees(state,side,platoon,[x,y],'air')]
    return result


def radio_cost(state,u):return 1 if u['kind']=='radioman' else 2


def radio_contacts(state,u):
    # HQ coordinates all platoons. A wireless operator relays its own platoon.
    memory=state.get('platoon_intel',{}).get(u['side'],{})
    pool=memory.values() if u['kind']=='commander' else [memory.get(group(u),{})]
    contacts={}
    for group_memory in pool:
        for uid,c in group_memory.items():
            if c['last_seen_round']>=state['round']-1 and (uid not in contacts or c['last_seen_round']>=contacts[uid]['last_seen_round']):contacts[uid]=copy.deepcopy(c)
    return contacts


def options(state,u):
    from .engine import distance, terrain
    from .operations import cells
    from .fieldworks import CONCEALMENT
    result=dict(radio_update=False,observe=False,conceal=False,mortar_fire=[],demolition=[])
    if not enabled(state) or not state['ready'] or state['winner'] or not active(u) or u['pinned'] or u['side']!=state['turn']:return result
    if u['kind'] in {'commander','radioman'}:
        result['radio_update']=u['ap']>=radio_cost(state,u) and u.get('radio_round')!=state['round'] and bool(radio_contacts(state,u))
    result['observe']=u['kind'] in {'scout','radioman','mountain','pathfinder'} and u['ap']>=1 and not u.get('observing')
    result['conceal']=bool(u.get('stealth') and u['ap']>=2 and not u.get('camouflaged') and terrain(*u['pos'],state) in CONCEALMENT)
    if u.get('mortar_range') and u.get('shells') and u['ap']>=2 and u.get('mortar_round')!=state['round']:
        # Local observation or an explicitly received report; no hidden occupancy.
        reports={tuple(c['pos']) for c in reports_for(state,u['side'])}
        result['mortar_fire']=[p for p in cells(state,u['pos'],u['mortar_range']) if distance(u['pos'],p)>=2 and (group_sees(state,u['side'],group(u),p) or tuple(p) in reports)]
    if u.get('demolition_charges') and u['ap']>=2:
        seen=group_ids(state,u['side'],group(u))
        result['demolition']=[t['id'] for t in state['units'] if t['side']!=u['side'] and active(t) and t['id'] in seen and t.get('armor') and distance(u['pos'],t['pos'])==1]
    return result


def sector(state,pos):
    board=state['battlefield'];x=min(2,pos[0]*3//board['width']);y=min(2,pos[1]*3//board['height'])
    return [['northwest','north','northeast'],['west','central','east'],['southwest','south','southeast']][y][x]


def alert(state,side,pos,kind):
    # Direction is deliberately coarse. Never publish center, radius or sender.
    enemy='de' if side=='us' else 'us'
    event=dict(kind=kind,sector=sector(state,pos),round=state['round'],expires_round=state['round']+2,revision=state['revision']+1)
    state.setdefault('signal_alerts',{}).setdefault(enemy,[]).append(event)
    state['signal_alerts'][enemy]=state['signal_alerts'][enemy][-12:]
    message=({'recon':'Enemy reconnaissance aircraft heard over the ','airlift':'Enemy transport aircraft heard over the '}.get(kind,'Enemy wireless traffic heard from the '))+event['sector']+' sector. Exact locations unknown.'
    state.setdefault('reports',{}).setdefault(enemy,dict(log=[],combat=[]))['log'].append(message)


def action(state,u,order,legal,roll):
    from .operations import cells
    from .engine import distance
    kind=order['kind']
    if kind in {'radio_update','observe','conceal'} and not legal.get(kind):raise ValueError('Order unavailable: check AP, role, terrain and once-per-turn limits.')
    if kind=='radio_update':
        reports=radio_contacts(state,u)
        for c in reports.values():c.update(source='radio',expires_round=state['round']+2)
        state['radio_reports'][u['side']].update(reports)
        u.update(ap=u['ap']-radio_cost(state,u),radio_round=state['round'],overwatch=False)
        alert(state,u['side'],u['pos'],'radio')
        return f"Shared {len(reports)} dated contact report(s). Reports do not track movement or reveal current strength."
    if kind=='observe':
        u.update(ap=u['ap']-1,observing=True,overwatch=False)
        return 'Observation established: +2 sight until moving, attacking or the next friendly turn. No extra weapon range.'
    if kind=='conceal':
        u.update(ap=u['ap']-2,camouflaged=True,overwatch=False)
        return 'Camouflaged in cover. Revealed by close scouts or aerial search; moving or attacking breaks concealment.'
    if kind=='mortar_fire':
        pos=order.get('pos')
        if pos not in legal['mortar_fire']:raise ValueError('Mortars need 2 AP, shells and a spotted or radio-reported hex at range 2–8.')
        u.update(ap=u['ap']-2,shells=u['shells']-1,mortar_round=state['round'],overwatch=False)
        state.setdefault('barrages',[]).append(dict(side=u['side'],pos=list(pos),area=cells(state,pos,1),ttl=2,attacker=u['id'],weapon='mortar'))
        return 'Mortar fire called: one shell expended. Marked area hits after the enemy turn; all infantry there is at risk.'
    if kind=='demolition':
        if order.get('target') not in legal['demolition']:raise ValueError('Demolition needs an adjacent spotted armored vehicle, 2 AP and one charge.')
        from . import weapons
        from .combat_display import record_combat
        target=next(t for t in state['units'] if t['id']==order['target']);die=roll()
        u.update(ap=u['ap']-2,demolition_charges=u['demolition_charges']-1,overwatch=False)
        result,impacts=weapons.resolve(state,u,target,die,4,weapon='demolition')
        state['last_combat']=dict(kind='Demolition charge',attacker=u['id'],target=target['id'],roll=die,threshold=4,result=result,impacts=impacts,revision=state['revision']+1)
        record_combat(state,{},'Adjacent anti-armor charge: 4+ to hit, 2 damage, 2 AP and one charge.')
        return 'Demolition charge: '+result+'.'
    raise ValueError('Unknown specialist order.')


def before_order(u,kind):
    if kind in {'move','fire','assault','grenade','area_fire','demolition','mortar_fire','snipe','suppress','load','unload'}:
        u.pop('observing',None);u.pop('camouflaged',None)


def start_turn(state,side):
    for u in state['units']:
        if u['side']==side:u.pop('observing',None)
    for team in ('us','de'):
        if team in state.get('radio_reports',{}):state['radio_reports'][team]={uid:c for uid,c in state['radio_reports'][team].items() if state['round']<c['expires_round']}


def revealed(before,after):
    return enabled(after) and any(c['pos']!=before.get('platoon_intel',{}).get(side,{}).get(platoon,{}).get(uid,{}).get('pos')
        for side,groups in after.get('platoon_intel',{}).items() for platoon,memory in groups.items() for uid,c in memory.items())
