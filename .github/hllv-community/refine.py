"""Guarded, idempotent integration refinements for the community release."""
from pathlib import Path

def replace_once(source,old,new):
    if new in source:return source
    assert source.count(old)==1, 'Changed integration point: '+old[:100]
    return source.replace(old,new,1)

def main():
    p=Path('.github/hllv-community/app.js');s=p.read_text()
    if 'HLLVSubmissionTypes.bind' in s:
        print('Submission types v2 includes these refinements.');return
    s=replace_once(s," const date=v=>", " function sameWording(row,payload){return !!row&&!!payload&&['title','problem','desired_outcome','kind','related_issue'].every(k=>String(row[k]||'').trim()===String(payload[k]||'').trim());}\n const date=v=>")
    s=replace_once(s,"el('cbCancel').onclick=()=>{if(safeLeave())", "el('cbCancel').onclick=()=>{if(busy)return;if(safeLeave())")
    s=replace_once(s,"formRequest=s?.request_id||crypto.randomUUID();selected=s;uncertain=false;dirty=false;", "formRequest=s?.request_id||crypto.randomUUID();selected=s;uncertain=false;dirty=false;let attempted=null;\n  const lockForm=value=>el('cbSubmitForm')?.querySelectorAll('input,textarea,select').forEach(field=>field.disabled=value);")
    s=replace_once(s,"const t=epoch;busy=true;el('cbSend').disabled=true;el('cbFormFeedback').textContent='Saving your suggestion…';", "const t=epoch;attempted=payload;busy=true;lockForm(true);el('cbSend').disabled=true;el('cbFormFeedback').textContent='Saving your suggestion…';")
    s=replace_once(s,"if(!result?.id)throw new Error('Missing receipt');dirty=false;receipt=result;", "if(!result?.id||!sameWording(result,attempted)||(s&&result.version<=s.version))throw new Error('Receipt did not confirm this wording');dirty=false;receipt=result;")
    s=replace_once(s,"   finally{busy=false;}\n  };\n  el('cbCheckSave')", "   finally{busy=false;if(connected(t))lockForm(false);}\n  };\n  el('cbCheckSave')")
    s=replace_once(s,"if(found){dirty=false;receipt=found;view='receipt';showReceipt();}else{uncertain=false;el('cbSend').disabled=false;", "if(found&&sameWording(found,attempted)&&(!s||found.version>s.version)){dirty=false;receipt=found;view='receipt';showReceipt();}else if(found){const unchanged=s&&found.id===s.id&&found.version===s.version&&found.updated_at===s.updated_at;uncertain=!unchanged;el('cbSend').disabled=!unchanged;el('cbFormFeedback').textContent=unchanged?'The previous version is saved, but this revision is not confirmed. Your revised text is still here; you may try Save revision for review again.':'A different saved version was found. Your text is still here. Review My suggestions before replacing that saved version.';}else{uncertain=false;el('cbSend').disabled=false;")
    s=replace_once(s,"'[data-page],#brandHome,[data-suggestion-issue]'", "'[data-page],#brandHome,[data-suggestion-issue],[data-account]'")
    s=replace_once(s,"catch(_){HLLVPassword?.status({available:false});", "catch(_){window.HLLVPassword?.status({available:false});")
    s=replace_once(s,"el('cbRefresh').onclick=()=>paint();", "el('cbRefresh').onclick=()=>{notice('');paint();};")
    s=replace_once(s,"   await loadIdentity();if(callback)", """   setInterval(async()=>{
    if(!client||view!=='board'||busy||dirty||document.hidden||el('suggestionBox').classList.contains('hidden'))return;
    const t=epoch,ticket=serial;
    try{const result=await call('board',{page,query,order});if(t!==epoch||ticket!==serial||view!=='board')return;
     const signature=list=>JSON.stringify(list.map(s=>[s.id,s.version,s.votes,s.approved_at]));
     if(Array.isArray(result?.rows)&&signature(result.rows)!==signature(rows))notice('The board has changed. Select Refresh to see new suggestions and votes.');
    }catch(_){/* A failed background read must not erase the displayed board. */}
   },60000);
   await loadIdentity();if(callback)""")
    p.write_text(s)
    # Repair the pre-existing standalone Playwright fixture, not the login component.
    p=Path('.github/hllv-password/test_browser.py');s=p.read_text()
    s=replace_once(s,"lambda r,f=filename,t=mime:r.fulfill(body=(SRC/f).read_text(),content_type=t)","lambda r,request,f=filename,t=mime:r.fulfill(body=(SRC/f).read_text(),content_type=t)")
    p.write_text(s)
    # Regression: recovery must not call an old saved revision a successful new save.
    p=Path('.github/hllv-community/test_browser.py');s=p.read_text()
    s=replace_once(s,"    elif act in ['edit','withdraw','moderate','vote']:\n     s=store[arg['id']]", "    elif act in ['edit','withdraw','moderate','vote']:\n     if act=='edit' and flags.get('fail_edit'):flags['fail_edit']=False;route.abort();return\n     s=store[arg['id']]")
    s=replace_once(s,"     s['updated_at']=stamp();data=project(s,uid,act!='vote')", "     s['updated_at']=stamp();data=project(s,uid,act!='vote')\n     if act=='edit' and flags.get('lose_edit'):flags['lose_edit']=False;route.abort();return")
    insertion=""" # Failed revision check must preserve the draft and explicitly identify the older saved version.
 page.locator('#cbReceiptMine').click();page.locator('.cb-entry').first.click();page.locator('#cbEdit').click();page.fill('#cbOutcome','This revision did not reach the server on its first attempt.');page.locator('#cbConsent').check();flags['fail_edit']=True;page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();page.locator('#cbCheckSave').click();expect(page.locator('#cbFormFeedback')).to_contain_text('this revision is not confirmed');assert page.locator('#cbOutcome').input_value()=='This revision did not reach the server on its first attempt.';expect(page.locator('#cbSend')).to_be_enabled();send(page)
 # A genuinely saved revision with a dropped response is recovered only by matching its wording/version.
 page.locator('#cbReceiptMine').click();page.locator('.cb-entry').first.click();page.locator('#cbEdit').click();page.fill('#cbOutcome','This revision was saved but its confirmation response was lost.');page.locator('#cbConsent').check();flags['lose_edit']=True;page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();page.locator('#cbCheckSave').click();expect(page.locator('.cb-receipt')).to_contain_text('Your suggestion is saved')
"""
    s=replace_once(s," page.locator('#cbReceiptBoard').click();flags['lose_save']=True;",insertion+" page.locator('#cbReceiptBoard').click();flags['lose_save']=True;")
    p.write_text(s)
    print('REFINEMENTS_READY: draft-preserving revision recovery, form locks, guarded navigation, board refresh notices, standalone test-fixture correction')
if __name__=='__main__':main()
