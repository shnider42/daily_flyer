"""Offline UI contract checks: real new JS/CSS, simulated public game hooks.
Not a tactical-engine, full application, production, or physical Safari test.
Optional test dependencies: playwright and Chromium. No external requests.
"""
import json
import os
from pathlib import Path
import unittest
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('DSL_SCREENSHOTS','/mnt/data/dsl-checks-new'))
def html(storage=None):
    s=(ROOT/'tests/domain-training-fixture.html').read_text()
    s=s.replace('<!-- STYLES -->',''.join('<style>'+(ROOT/f'ww2_tactics/static/{n}.css').read_text()+'</style>' for n in ['domain-training','touch-command']))
    s=s.replace('<!-- MODULES -->',''.join('<script>'+(ROOT/f'ww2_tactics/static/{n}.js').read_text()+'</script>' for n in ['domain-training','touch-command']))
    if storage:s=s.replace('<script>\n// Contract','<script>window.TEST_STORAGE='+json.dumps(storage).replace('</','<\\/')+';</script><script>\n// Contract')
    return s
class Tutorials(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);OUT.mkdir(parents=True,exist_ok=True)
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.pw.stop()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True);self.page=self.context.new_page();self.page.set_default_timeout(1800);self.errors=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.on('dialog',lambda d:d.accept());self.page.set_content(html());self.wait()
    def tearDown(self):
        if self.errors:print('Browser errors:',self.errors)
        self.context.close();self.assertEqual(self.errors,[])
    def wait(self):self.page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def progress(self,k):return self.page.evaluate('(k)=>ww2DomainTraining.progress[k]',k)
    def start(self,k):self.page.locator(f'#{k}TrainingStart').click();self.page.wait_for_function('state && !busy');self.wait()
    def next(self,k):self.page.locator('#domainTrainingNext').click();self.wait()
    def select(self,uid):self.page.locator('#map .unit[data-unit-id="'+uid+'"]').click();self.wait()
    def move(self,k):
        p=self.page.evaluate('state.legal[selected].moves[0].pos');self.page.locator(f'#map .hex[data-x="{p[0]}"][data-y="{p[1]}"]').click();self.wait()
    def to_move(self,k):self.start(k);self.next(k);self.select('own1');self.next(k)
    def give(self,id):self.page.locator('#domainTrainingFind').click();self.wait();self.page.locator('#'+id).click();self.wait()
    def support(self,k):
        self.to_move(k);self.move(k);self.next(k)
        if k=='naval':self.select('own2');self.give('recon');self.page.locator('.recon-choice').first.click();self.wait()
        else:self.give('overwatch')
    def attack(self,k):
        self.support(k);self.next(k);self.select('own1' if k=='naval' else 'own2');self.select('enemy1' if k=='naval' else 'enemy2');self.give('torpedo' if k=='naval' else 'fire')
    def test_01_separate_creation(self):
        self.page.evaluate("localStorage.setItem('ww2-first-command-v1','ground unchanged')");self.start('naval')
        self.assertEqual(self.page.evaluate('calls.creates[0]'),{'ruleset':'dsl','opponent':'computer','scenario':'current:midway','side':'us'});self.assertEqual(self.page.evaluate("localStorage.getItem('ww2-first-command-v1')"),'ground unchanged');self.assertTrue(self.page.evaluate("savedSessions.some(s=>s.code==='ground-existing')"))
    def test_02_air_side(self):
        self.start('air');self.assertEqual(self.page.evaluate('calls.creates[0].side'),'de');self.assertEqual(self.page.evaluate('state.scenario.id'),'current:britain');self.assertIn('not the launch',self.page.locator('#domainTrainingText').inner_text())
    def test_03_reading_not_movement(self):
        self.to_move('naval');self.assertFalse(self.progress('naval')['done']);self.assertTrue(self.page.locator('#domainTrainingNext').is_hidden());self.assertEqual(self.page.evaluate('calls.orders.length'),0)
    def test_04_naval_move(self):
        self.to_move('naval');self.move('naval');self.assertTrue(self.progress('naval')['done']);self.assertIn('Movement confirmed',self.progress('naval')['feedback'])
    def test_05_air_move(self):
        self.to_move('air');self.move('air');self.assertTrue(self.progress('air')['done']);self.assertIn('2',self.progress('air')['practice'])
    def test_06_rejected_order(self):
        self.to_move('naval');self.page.evaluate('failNext=true');self.move('naval');self.assertFalse(self.progress('naval')['done']);self.assertEqual(self.page.locator('#touchConfirmedTrail').count(),0)
    def test_07_lost_response(self):
        self.to_move('air');self.page.evaluate('loseNext=true');self.move('air');self.assertFalse(self.progress('air')['done']);self.page.evaluate('refresh()');self.wait();self.assertTrue(self.progress('air')['done']);self.assertEqual(self.page.evaluate('calls.orders.length'),1)
    def test_08_enemy_history(self):
        self.to_move('naval');self.page.evaluate("() => {state.revision=2;state.action_history=[{revision:2,side:'de',action:{kind:'move',unit:'own1',pos:[3,6]}}];render()}");self.wait();self.assertFalse(self.progress('naval')['done'])
    def test_09_search(self):
        self.support('naval');self.assertTrue(self.progress('naval')['done']);self.assertIn('3',self.progress('naval')['practice']);self.assertEqual(self.page.evaluate('calls.orders.at(-1).kind'),'recon')
    def test_10_interception(self):
        self.support('air');self.assertIn('not an attack',self.progress('air')['feedback']);self.assertNotIn('4',self.progress('air')['practice'])
    def test_11_torpedo_miss(self):
        self.attack('naval');self.assertTrue(self.progress('naval')['done']);self.assertIn('Missed',self.progress('naval')['feedback']);self.assertEqual(self.page.evaluate("state.units.find(u=>u.id==='own1').torpedoes"),1)
    def test_12_bomber_miss(self):
        self.attack('air');self.assertIn('4',self.progress('air')['practice']);self.assertEqual(self.page.evaluate("state.units.find(u=>u.id==='own2').bombs"),1)
    def test_13_review_without_attack(self):
        self.support('naval');self.page.evaluate('() => {noTargets=true;state.legal=legal(state);states[state.code]=structuredClone(state);render()}');self.next('naval');self.assertIn('No legal attack',self.page.locator('#domainTrainingTitle').inner_text());self.page.locator('#domainTrainingReview').click();self.wait();self.assertIn('4',self.progress('naval')['review']);self.assertNotIn('4',self.progress('naval')['practice'])
    def test_14_service(self):
        self.attack('air');self.next('air');self.give('rearm');self.assertIn('5',self.progress('air')['practice']);self.assertEqual(self.page.evaluate("state.units.find(u=>u.id==='own2').bombs"),2)
    def test_15_no_fake_repair(self):
        self.attack('naval');self.next('naval');self.page.locator('#domainTrainingReview').click();self.wait();self.assertIn('5',self.progress('naval')['review']);self.assertNotIn('5',self.progress('naval')['practice'])
    def test_16_independent_runs(self):
        self.to_move('naval');old=self.progress('naval')['code'];self.page.locator('#domainTrainingPause').click();self.wait();self.assertTrue(self.progress('naval')['paused']);self.page.locator('#homeBattles').click();self.start('air');self.assertNotEqual(old,self.progress('air')['code']);self.page.locator('#homeBattles').click();self.start('naval');self.assertEqual(self.progress('naval')['code'],old);self.assertEqual(self.progress('naval')['step'],2);self.assertEqual(self.page.evaluate('calls.creates.length'),2)
    def test_17_pending_target_safety(self):
        self.to_move('naval');self.page.evaluate("smokeMode=true;document.dispatchEvent(new Event('ww2:render'))");self.wait();before=self.page.evaluate('JSON.stringify({state,selected,target,smokeMode,calls})');self.page.locator('#domainTrainingFind').click();self.wait();self.assertEqual(self.page.evaluate('JSON.stringify({state,selected,target,smokeMode,calls})'),before)
    def test_18_battle_identity(self):
        self.start('naval');self.page.evaluate('state.battle_number++;render()');self.wait();self.assertTrue(self.page.locator('#domainTrainingCard').is_hidden())
    def test_19_ignore(self):
        self.start('air');self.page.evaluate("$('lessonIgnore').click()");self.wait();self.assertTrue(self.progress('air')['paused']);self.assertEqual(self.page.evaluate('ww2Experience.level'),'simple')
    def test_20_full_turn(self):
        self.attack('air');self.next('air');self.give('rearm');self.next('air');self.page.evaluate('replay=true');self.page.locator('#end').click();self.wait();self.assertTrue(self.progress('air')['done']);self.assertTrue(self.page.evaluate('!!playbackSession'));self.page.locator('#skipPlayback').click();self.wait();self.next('air');self.assertEqual(self.progress('air')['step'],7);self.assertTrue(self.progress('air')['done']);self.next('air');self.next('air');self.assertTrue(self.progress('air')['completed'])
    def test_21_storage(self):
        self.to_move('naval');self.page.locator('#domainTrainingPause').click();self.wait();data=self.page.evaluate('({storage:storeData,states,savedSessions})');self.page.goto('about:blank');self.page.set_content(html(data['storage']));self.page.evaluate('(d)=>{states=d.states;savedSessions=d.savedSessions}',data);self.wait();self.start('naval');self.assertEqual(self.progress('naval')['step'],2);self.assertEqual(self.page.evaluate('calls.creates.length'),0)
    def test_22_reduced_motion(self):
        self.page.emulate_media(reduced_motion='reduce');self.to_move('naval');self.move('naval');self.assertEqual(self.page.locator('#touchConfirmedTrail').count(),0);self.assertTrue(self.progress('naval')['done'])
    def test_23_flight_trail(self):
        self.to_move('air');self.move('air');self.assertEqual(self.page.locator('.touch-flight-trail').count(),1);self.assertIn('L',self.page.locator('.touch-movement-path').get_attribute('d'))
    def test_24_target_card(self):
        self.support('naval');self.next('naval');self.select('own1');self.select('enemy1');self.page.locator('#domainTrainingFind').click();self.wait();self.assertTrue(self.page.locator('#touchTargetCard').is_visible());self.assertIn('Selected, not fired',self.page.locator('#touchTargetCard').inner_text());self.assertTrue(self.page.locator('#domainTrainingCard').evaluate("n=>n.classList.contains('training-inline')"));self.assertEqual(self.page.locator('#touchUnitPortrait').count(),1);self.page.screenshot(path=str(OUT/'naval-orders-390.png'))
    def test_25_geometry(self):
        self.to_move('air')
        for width,height in [(320,740),(390,844),(430,932),(844,390),(1440,900)]:
            self.page.set_viewport_size({'width':width,'height':height});self.wait();self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));card=self.page.locator('#domainTrainingCard').bounding_box();board=self.page.locator('#mapWrap').bounding_box();self.assertGreater(board['height'],90)
            if width==844:self.assertLessEqual(board['x']+board['width'],card['x']+1)
            else:self.assertLessEqual(board['y']+board['height'],card['y']+1)
            self.page.screenshot(path=str(OUT/f'air-practice-{width}.png'))
    def test_26_display_no_writes(self):
        self.start('air');before=self.page.evaluate('JSON.stringify({state,posts:calls.orders})');self.page.evaluate("ww2Experience.level='expert';document.dispatchEvent(new Event('ww2:experience'))");self.wait();self.assertEqual(self.page.evaluate('JSON.stringify({state,posts:calls.orders})'),before)
    def test_27_legacy_empires(self):
        self.start('naval');self.page.evaluate("state.edition='legacy';render()");self.wait();self.assertFalse(self.page.evaluate("document.body.classList.contains('dsl-touch-command')"));self.page.evaluate("state.edition='current';document.body.classList.add('empires-active');render()");self.wait();self.assertFalse(self.page.evaluate("document.body.classList.contains('dsl-touch-command')"))
    def test_28_storage_failure(self):
        self.page.evaluate("() => {localStorage.setItem=()=>{throw Error('disabled')}}");self.start('naval');self.next('naval');self.assertEqual(self.progress('naval')['step'],1)
    def test_29_keyboard(self):
        self.start('naval');self.next('naval');self.page.locator('#map .unit[data-unit-id="own1"]').focus();self.page.keyboard.press('Enter');self.wait();self.assertTrue(self.progress('naval')['done'])
    def test_30_double_start(self):
        self.page.evaluate("() => {ww2DomainTraining.start('naval');ww2DomainTraining.start('air')}");self.wait();self.assertEqual(self.page.evaluate('calls.creates.length'),1)
    def test_31_home(self):
        self.assertEqual(self.page.locator('#domainTrainingHome button:not([hidden])').count(),2);self.page.screenshot(path=str(OUT/'tutorial-home-390.png'),full_page=True)
    def test_32_hidden_target(self):
        self.start('naval');self.select('own1');self.page.evaluate("target='invisible';state.legal[selected].targets.push({id:'invisible',threshold:2,damage:4});render()");self.wait();self.assertTrue(self.page.locator('#touchTargetCard').is_hidden())
if __name__=='__main__':unittest.main(verbosity=2)
