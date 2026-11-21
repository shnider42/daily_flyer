"""Explicit editorial holds, not an automatic topic classifier.
Keep original attribution, links and hashes while withholding misleading previews.
A hold applies only to the exact observed wording hash, not every future reply by
that author. This does not label other collected text as editorially approved.
"""
import json
from pathlib import Path

RULES=Path(__file__).with_name('content-review.json')

def apply(result,rules=None):
    rules=json.loads(RULES.read_text())['holds'] if rules is None else rules
    holds={(r['thread_url'],r['response_id'],r['content_sha256']):r for r in rules}
    pending=0
    for thread in result.get('threads',[]):
        for reply in thread.get('replies',[]):
            reply.pop('content_review',None)
            hold=holds.get((thread['url'],reply['id'],reply['content_sha256']))
            if hold:
                reply.pop('excerpt',None)
                reply['content_review']={'state':'needs_review','reason':hold['reason'],'flagged_at':hold['flagged_at']}
                pending+=1
    result['content_reviews_pending']=pending
    return result

if __name__=='__main__':
    path=Path('hllv_tracker/official-feed.json');feed=json.loads(path.read_text())
    apply(feed['response_monitor'])
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    print('CONTENT_REVIEW_HOLDS',feed['response_monitor']['content_reviews_pending'])
