// Follow the visible mobile navigation before operating a secondary control.
exports.tap=async(page,locator)=>{
 await page.waitForFunction(()=>{
  if(typeof state==='undefined'||!state||document.getElementById('game').hidden)return true;
  if(innerWidth>=1100)return !!window.ww2Desktop?.active&&!document.getElementById('mobileOrderDock');
  return state.ruleset!=='dsl'||(!window.ww2Desktop?.active&&!!document.getElementById('mobileOrderDock'));
 });
 await locator.waitFor({state:'attached'});
 const target=await locator.evaluate(e=>e.closest('dialog')?.id||null);
 const routes={mobileBattleMenu:'mobileMenuOpen',mobileRoster:'mobileRosterOpen',mobileGuide:'guideToggle',battleViewSettings:'battleViewOpen',mobileUnitDetails:'mobileOrderToggle',dadOrders:'dadOrdersOpen',dadUnitDetails:'mobileOrderToggle',experimentalRoster:'experimentalRosterOpen',experimentalUnitDetails:'experimentalUnitOpen',experimentalBattle:'experimentalBattleOpen'};
 for(const id of Object.keys(routes)){
  const sheet=page.locator('#'+id);
  if(id!==target&&await sheet.count()&&await sheet.evaluate(e=>e.open))await page.locator('#'+id+'Close').click();
 }
 if(target==='mobileGuide'&&!await page.locator('#mobileGuide').evaluate(e=>e.open)&&!await page.locator('#battleViewSettings').evaluate(e=>e.open))await page.locator('#battleViewOpen').click();
 if(routes[target]&&!await page.locator('#'+target).evaluate(e=>e.open))await page.locator('#'+routes[target]).click();
 await locator.click();
};
