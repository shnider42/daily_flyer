"""Apply the reviewed narrow runtime diff on the isolated validation branch."""
from pathlib import Path
r=Path('.')
def edit(name,old,new):
 p=r/name;s=p.read_text();assert s.count(old)==1,(name,s.count(old),old[:90]);p.write_text(s.replace(old,new))
edit('ww2_tactics/order_history.py','def perform(state, side, action):','''def perform(state, side, action):
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


def _perform(state, side, action):''')
edit('ww2_web.py',"        state.pop(HISTORY_KEY, None)\n        board = battlefield(state)","""        state.pop(HISTORY_KEY, None)
        # Replay frames are already fog-filtered when the computer creates them.
        # Keep their immutable payload outside the deep-copied live projection.
        replay = state.get('computer_playback')
        if isinstance(replay, dict):
            state['computer_playback'] = {'id': replay.get('id')} if replay else {}
        board = battlefield(state)""")
edit('ww2_web.py','            return public_state(state,side)','''            result = public_state(state,side)
            if isinstance(replay, dict):
                replay_key = f"{row['code']}:{side}:{state.get('battle_number') or 1}:{replay.get('id')}"
                # Opt-in acknowledgement, never a cache shared between players.
                # Old clients and fresh/reconnected browsers still receive it all.
                known = request.headers.get('X-WW2-Replay')
                result['computer_playback'] = ({'id': replay.get('id'), 'unchanged': True}
                    if known == replay_key and isinstance(replay.get('frames'), list) else replay)
            return result''')
edit('ww2_tactics/static/game.js',"async function api(path, body){\n const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});\n const data=await response.json();if(!response.ok)throw new Error((data.error||'The server could not complete that action.')+(data.request_id?` Reference: ${data.request_id}`:''));return data;\n}",'''function replayIdentity(value){
 const movie=value?.computer_playback;
 return movie&&movie.id!==undefined&&value.code&&value.side?`${value.code}:${value.side}:${value.battle_number||1}:${movie.id}`:null;
}
async function api(path, body){
 // Retain the exact request's public movie, not a global cache or later state.
 const source=state,auth=session?{Authorization:`Bearer ${session.token}`}:{},movie=source?.computer_playback;
 const known=path.split('?')[0]===`/api/match/${source?.code}`&&session?.code===source?.code&&Array.isArray(movie?.frames)?replayIdentity(source):null;
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...auth,...(known?{'X-WW2-Replay':known}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let data=await response.json();if(!response.ok)throw new Error((data.error||'The server could not complete that action.')+(data.request_id?` Reference: ${data.request_id}`:''));
 if(data.computer_playback?.unchanged){
  if(known&&known===replayIdentity(data))data.computer_playback=movie;
  else{
   // A lost/unknown movie can only trigger a full READ. Never replay a POST,
   // which might already have moved, rolled dice or ended the turn.
   const fresh=await fetch(path.split('?')[0],{headers:auth});
   data=await fresh.json();if(!fresh.ok||data.computer_playback?.unchanged)throw new Error('Could not refresh the replay. Refresh the battlefield; do not repeat the last order.');
  }
 }
 return data;
}''')
edit('ww2_tactics/static/game.js'," if(!sameUnits){svg.querySelectorAll('.unit,.smoke-cloud,.barrage-zone,.incoming-mark,.station-mark').forEach(n=>n.remove());svg._counters=new Map();}",""" if(!sameUnits){
  svg.querySelectorAll('.smoke-cloud,.barrage-zone,.incoming-mark,.station-mark').forEach(n=>n.remove());
  const visible=new Set(display.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id).map(u=>u.id));
  for(const [id,g] of svg._counters)if(!visible.has(id)){g.remove();svg._counters.delete(id);}
 }""")
edit('ww2_tactics/static/game.js',"  if(sameUnits&&reuse){const g=svg._counters.get(u.id);", "  const existing=svg._counters.get(u.id),unitKey=JSON.stringify(u);\n  if(reuse&&existing?._unitKey===unitKey){const g=existing;")
edit('ww2_tactics/static/game.js',"  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit", "  existing?.remove();\n  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit")
edit('ww2_tactics/static/game.js',"  svg._counters.set(u.id,g);g._platoonFilter=platoonFilter;", "  svg._counters.set(u.id,g);g._platoonFilter=platoonFilter;g._unitKey=unitKey;")
edit('ww2_tactics/static/combined.js',"  svg.querySelectorAll('.fog-layer,.contact-marker,.passenger-marker').forEach(n=>n.remove());\n  if(!state.fog_of_war)return;\n  const seen=new Set(((sky?snapshot.visible_air_hexes:snapshot.visible_hexes)||[]).map(p=>p.join(','))),layer=element('g',{class:'fog-layer','aria-hidden':'true'});\n  state.map.forEach((row,y)=>row.forEach((_,x)=>{if(!seen.has(`${x},${y}`))layer.append(element('polygon',{points:points(x,y)}));}));\n  svg.insertBefore(layer,svg.querySelector('.unit'));",'''  svg.querySelectorAll('.contact-marker,.passenger-marker').forEach(n=>n.remove());
  if(!state.fog_of_war){svg.querySelector('.fog-layer')?.remove();return;}
  const seen=new Set(((sky?snapshot.visible_air_hexes:snapshot.visible_hexes)||[]).map(p=>p.join(',')));
  let layer=svg.querySelector('.fog-layer');
  if(!layer){layer=element('g',{class:'fog-layer','aria-hidden':'true'});layer._cells=new Map();svg.insertBefore(layer,svg.querySelector('.unit'));}
  // Every cell is still checked against the authoritative public footprint.
  // Only polygons whose visibility changed are inserted/removed.
  state.map.forEach((row,y)=>row.forEach((_,x)=>{
   const key=`${x},${y}`,tile=layer._cells.get(key);
   if(seen.has(key)){if(tile){tile.remove();layer._cells.delete(key);}}
   else if(!tile){const next=element('polygon',{points:points(x,y)});layer._cells.set(key,next);layer.append(next);}
  }));''')
edit('ww2_tactics/static/unit-art.js',"  if(!force)size(svg);",'''  // ResizeObserver handles physical size changes. A new map can change only
  // the viewBox; measure that once after the rest of the render has finished.
  if(!force&&svg._artViewWidth!==svg.viewBox.baseVal.width){
   svg._artViewWidth=svg.viewBox.baseVal.width;
   requestAnimationFrame(()=>{if(svg.isConnected)size(svg);});
  }''')
edit('ww2_tactics/static/fubar.js'," let layer='both',battle=null,pickerRevision=null;", " let layer='both',battle=null,pickerRevision=null,positionFrame=null;\n function schedulePosition(){if(positionFrame===null)positionFrame=requestAnimationFrame(()=>{positionFrame=null;position();});}")
for old,new in [
 ("new ResizeObserver(position)","new ResizeObserver(schedulePosition)"),
 ("new MutationObserver(position)","new MutationObserver(schedulePosition)"),
 ("window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});", "window.addEventListener('resize',schedulePosition);window.addEventListener('scroll',schedulePosition,{passive:true});"),
 ("paint(svg,snapshot);position();", "paint(svg,snapshot);schedulePosition();"),
 ("document.addEventListener('ww2:render',position);document.addEventListener('ww2:layout',position);", "document.addEventListener('ww2:render',schedulePosition);document.addEventListener('ww2:layout',schedulePosition);")]:edit('ww2_tactics/static/fubar.js',old,new)
