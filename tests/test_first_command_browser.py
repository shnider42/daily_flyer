"""Browser contract checks for first-command.js; no production or engine writes.
Requires the optional test package playwright and a Chromium executable.
The fixture models public UI hooks and storage, NOT combat/AI correctness.
All resources are inlined for offline rendering; reload tests reinitialize
the fixture using serialized storage. No network or browser policy changes.
"""
import json
import os
import pathlib
import unittest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHOTS = pathlib.Path(os.environ.get('DSL_SCREENSHOTS', '/tmp/dsl-first-command-shots'))
class FirstCommandBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.url = 'offline-fixture'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        SHOTS.mkdir(parents=True, exist_ok=True)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        self.errors=[]
        self.page = None
        self.load()
    def load(self, query='', preserve=False, blocked=False):
        data=self.page.evaluate('Object.fromEntries(__testStorage)') if preserve and self.page else {}
        if self.page:self.page.close()
        self.page=self.context.new_page()
        self.page.set_default_timeout(6000)
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('dialog',lambda d:d.accept())
        # Offline browser rendering only: no HTTP/file navigation or live app.
        html=(ROOT/'tests/first-command-fixture.html').read_text()
        css=(ROOT/'ww2_tactics/static/first-command.css').read_text()
        js=(ROOT/'ww2_tactics/static/first-command.js').read_text()
        html=html.replace('<link rel="stylesheet" href="/ww2_tactics/static/first-command.css?v=1">','<style>'+css+'</style>')
        html=html.replace('<script src="/ww2_tactics/static/first-command.js?v=1"></script>','<script>'+js+'</script>')
        html=html.replace('new URLSearchParams(location.search)', 'new URLSearchParams('+json.dumps(query)+')')
        shim="""<script>
        window.__testStorage=new Map(Object.entries(DATA));
        class FixtureStorage{getItem(k){return __testStorage.get(k)??null}setItem(k,v){__testStorage.set(k,String(v))}removeItem(k){__testStorage.delete(k)}}
        Object.defineProperty(window,'Storage',{value:FixtureStorage});
        Object.defineProperty(window,'localStorage',{value:new FixtureStorage()});
        BLOCK
        </script>""".replace('DATA',json.dumps(data)).replace('BLOCK', "Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')}" if blocked else '')
        html=html.replace('<script>','__FIRST_SCRIPT__',1).replace('__FIRST_SCRIPT__',shim+'<script>',1)
        self.page.set_content(html)
        self.page.wait_for_function('!!window.ww2FirstCommand')
    def tearDown(self):
        try:self.assertEqual(self.errors,[])
        finally:self.context.close()
    def tick(self):
        self.page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def progress(self):return self.page.evaluate('ww2FirstCommand.progress')
    def state(self):return self.page.evaluate('JSON.stringify(state)')
    def start(self):
        self.page.locator('#firstCommandStart').click()
        self.page.wait_for_function('state && !busy && ww2FirstCommand.progress')
        self.tick()
    def next(self):
        self.page.locator('#firstCommandNext').click(); self.tick()
    def select(self,unit):
        self.page.locator(f'#map .unit[data-unit-id="{unit}"]').click();self.tick()
    def to_move(self):
        self.start();self.next();self.select(self.progress()['unit']);self.next()
        self.assertEqual(self.progress()['step'],2)
    def move(self):
        pos=self.page.evaluate('state.legal[selected].moves[0].pos')
        self.page.locator(f'#map .hex[data-x="{pos[0]}"][data-y="{pos[1]}"]').click();self.tick()
    def do_order(self):
        self.next();self.tick()
        choice=self.progress()['order'];self.assertTrue(choice)
        self.select(choice['unit'])
        if choice.get('target'):self.select(choice['target'])
        self.page.locator('#firstCommandFind').click();self.tick()
        self.page.locator('#'+choice['control']).click();self.tick()
        self.assertTrue(self.progress()['done'])
    def test_complete_actions_and_miss(self):
        self.start();self.assertEqual(self.page.evaluate('counts.creates'),1)
        self.assertEqual(self.page.evaluate('posts[0].body'),{'ruleset':'dsl','opponent':'computer','scenario':'current:village','side':'us'})
        self.assertTrue(self.page.evaluate("savedSessions.some(s=>s.code==='old-greybridge')"))
        before=self.state();self.page.locator('#firstCommandFind').click();self.tick();self.assertEqual(self.state(),before)
        self.next();self.select(self.progress()['unit']);self.assertTrue(self.progress()['done'])
        self.assertEqual(self.page.evaluate('counts.orders'),0)
        self.next();self.move();self.assertTrue(self.progress()['done']);self.assertIn('AP',self.progress()['feedback'])
        self.do_order();self.assertIn('Missed',self.progress()['feedback'])
        self.next();self.assertEqual(self.progress()['step'],4)
        self.page.evaluate('playReplay=true');self.page.locator('#end').click();self.tick()
        self.assertTrue(self.progress()['done']);self.assertTrue(self.page.locator('#firstCommandNext').is_hidden())
        self.page.locator('#skipPlayback').click();self.tick();self.next()
        self.assertEqual(self.progress()['step'],5);self.assertTrue(self.progress()['done'])
        self.next();self.next();self.assertTrue(self.progress()['completed'])
        self.assertEqual(self.page.evaluate('counts.orders'),3)
        self.assertEqual(set(self.progress()['practiced']),{'Select','Move','Give an order','End turn','Their turn'})
        self.assertEqual(self.page.evaluate("document.documentElement.style.getPropertyValue('--first-command-space')"),'')
    def test_failed_order_does_not_complete_step(self):
        self.to_move();self.page.evaluate('failNext=true');self.move()
        self.assertFalse(self.progress()['done']);self.assertEqual(self.page.evaluate('state.revision'),0)
        self.move();self.assertTrue(self.progress()['done'])
    def test_lost_response_recovers_from_own_history(self):
        self.to_move();self.page.evaluate('loseNext=true');self.move()
        self.assertFalse(self.progress()['done'])
        self.page.evaluate('refresh()');self.tick();self.assertTrue(self.progress()['done'])
        self.assertEqual(self.page.evaluate('counts.orders'),1)
    def test_reading_next_selection_help_never_issues_orders(self):
        self.to_move();before=self.state()
        self.page.evaluate("document.querySelector('#firstCommandNext').click()")
        self.assertEqual(self.progress()['step'],2)
        self.page.evaluate("smokeMode=true;combatMode={kind:'artillery'};document.dispatchEvent(new Event('ww2:render'))")
        self.tick();self.page.locator('#firstCommandFind').click();self.tick()
        self.assertEqual(self.state(),before);self.assertTrue(self.page.evaluate('smokeMode'))
        self.assertEqual(self.page.evaluate('counts.orders'),0)
    def test_pause_resume_reload_keeps_same_battle(self):
        self.to_move();code=self.page.evaluate('session.code');before=self.state()
        self.page.locator('#firstCommandPause').click();self.tick()
        self.assertTrue(self.progress()['paused']);self.assertTrue(self.page.locator('#firstCommandCard').is_hidden())
        self.page.locator('#firstCommandResume').click();self.tick()
        self.assertEqual(self.state(),before);self.assertFalse(self.progress()['paused'])
        self.assertEqual(self.page.evaluate('counts.creates'),1)
        self.load(preserve=True)
        self.page.locator('#firstCommandStart').click();self.tick()
        self.assertEqual(self.page.evaluate('session.code'),code);self.assertEqual(self.progress()['step'],2)
        self.assertEqual(self.page.evaluate('counts.creates'),0)
    def test_no_target_uses_defensive_order(self):
        self.load(query='?no-target')
        self.to_move();self.move();self.do_order()
        self.assertIn('Dig in',self.progress()['feedback'])
    def test_wrong_battle_does_not_get_tutorial(self):
        self.to_move();before=self.progress()
        self.page.evaluate("state.battle_number=2;document.dispatchEvent(new Event('ww2:render'))")
        self.tick();self.assertTrue(self.page.locator('#firstCommandCard').is_hidden());self.assertEqual(self.progress(),before)
    def test_ignore_and_storage_blocked(self):
        self.page.locator('#firstCommandDismiss').click();self.tick();self.assertTrue(self.page.locator('#firstCommandHome').is_hidden())
        self.load(preserve=True);self.tick()
        self.assertTrue(self.page.locator('#firstCommandHome').is_hidden())
        self.page.locator('#firstCommandRestore').click();self.tick();self.assertTrue(self.page.locator('#firstCommandCard').is_visible())
        self.load(blocked=True);self.start()
        self.assertTrue(self.progress())
    def test_layouts_and_preference_changes(self):
        self.page.screenshot(path=str(SHOTS/'home-390.png'),full_page=True)
        self.to_move()
        for width,height in [(390,844),(320,568),(430,932),(844,390),(1440,900)]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width':width,'height':height});self.tick()
                before=self.state();selection=self.page.evaluate('selected')
                for level in ['expert','moderate','simple']:
                    self.page.evaluate('(v)=>ww2Experience.set(v)',level);self.tick()
                    self.assertEqual(self.state(),before);self.assertEqual(self.page.evaluate('selected'),selection)
                sizes=self.page.evaluate("""()=>{const map=$('mapWrap').getBoundingClientRect(),card=$('firstCommandCard').getBoundingClientRect();return{map:map.toJSON(),card:card.toJSON(),width:document.documentElement.scrollWidth,viewport:innerWidth}}""")
                self.assertLessEqual(sizes['width'],sizes['viewport']+1)
                self.assertGreater(sizes['map']['height'],80)
                # Rail is beneath the map or alongside it in landscape.
                self.assertTrue(sizes['map']['bottom']<=sizes['card']['top']+1 or sizes['map']['right']<=sizes['card']['left']+1)
                self.page.screenshot(path=str(SHOTS/f'practice-{width}.png'),full_page=True)
        self.assertEqual(self.page.evaluate('counts.orders'),0)
    def test_rail_geometry_stays_stable_across_steps(self):
        self.start()
        height=self.page.locator('#mapWrap').bounding_box()['height']
        self.next();self.select(self.progress()['unit']);self.next();self.move()
        self.assertAlmostEqual(self.page.locator('#mapWrap').bounding_box()['height'],height,delta=1)
    def test_phone_inline_orders_still_leave_a_map(self):
        self.load(query='?panels');self.page.set_viewport_size({'width':320,'height':568});self.to_move()
        self.assertGreater(self.page.locator('#mapWrap').bounding_box()['height'],90)
        self.assertEqual(self.page.evaluate('ww2Experience.level'),'simple')
        self.page.screenshot(path=str(SHOTS/'inline-orders-320.png'))
    def test_other_side_history_never_completes_move(self):
        self.to_move()
        self.page.evaluate("state.revision++;state.action_history.push({side:'de',revision:state.revision,action:{kind:'move',unit:selected}});document.dispatchEvent(new Event('ww2:render'))")
        self.tick();self.assertFalse(self.progress()['done'])
    def test_ignored_coach_pauses_first_command_too(self):
        self.to_move();before=self.state()
        self.page.evaluate("document.querySelector('#lessonIgnore').click()")
        self.tick();self.assertTrue(self.progress()['paused']);self.assertEqual(self.state(),before)
    def test_modal_carries_tutorial_without_extra_orders(self):
        self.to_move();self.move();self.next();choice=self.progress()['order']
        self.select(choice['unit']);self.select(choice['target'])
        before=self.state();orders=self.page.evaluate('counts.orders')
        self.page.locator('#firstCommandFind').click();self.tick()
        self.assertTrue(self.page.locator('#dadOrders').evaluate('(n)=>n.open'))
        self.assertEqual(self.page.locator('#firstCommandCard').evaluate('(n)=>n.parentElement.id'),'dadOrders')
        self.assertEqual(self.page.evaluate('counts.orders'),orders);self.assertEqual(self.state(),before)
        self.page.screenshot(path=str(SHOTS/'orders-guidance-390.png'))
        self.page.locator('#ordersClose').click();self.tick()
        self.assertEqual(self.page.locator('#firstCommandCard').evaluate('(n)=>n.parentElement.tagName'),'BODY')
    def test_show_me_zooms_small_hex_without_order(self):
        self.load(query='?panels');self.page.set_viewport_size({'width':320,'height':568});self.to_move()
        before=self.state();self.page.locator('#firstCommandFind').click();self.tick()
        self.assertTrue(self.page.locator('#mapWrap').evaluate("n=>n.classList.contains('enlarged')"))
        self.assertEqual(self.state(),before);self.assertEqual(self.page.evaluate('counts.orders'),0)
        self.page.screenshot(path=str(SHOTS/'inline-orders-320-zoomed.png'))
    def test_keyboard_selection(self):
        self.start();self.next()
        self.page.locator('#map .unit[data-unit-id="'+self.progress()['unit']+'"]').focus()
        self.page.keyboard.press('Enter');self.tick();self.assertTrue(self.progress()['done'])

    def test_reduced_motion(self):
        self.page.emulate_media(reduced_motion='reduce');self.to_move();self.move()
        self.assertEqual(self.page.locator('#confirmedMoveRing').evaluate('(n)=>getComputedStyle(n).animationName'),'none')

if __name__=='__main__':unittest.main(verbosity=2)
