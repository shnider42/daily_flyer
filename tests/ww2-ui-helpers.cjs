// Follow the visible mobile navigation before operating a secondary control.
exports.tap=async(page,locator)=>{
 await page.waitForFunction(()=>{
  if(typeof state==='undefined'||!state||document.getElementById('game').hidden)return true;
  if(innerWidth>=1100)return !!window.ww2Desktop?.active&&!document.getElementById('mobileOrderDock');
  return state.ruleset!=='dsl'||(!window.ww2Desktop?.active&&!!document.getElementById('mobileOrderDock'));
 });
 await locator.waitFor({state:'attached'});
 const target=await locator.evaluate(e=>e.closest('dialog')?.id||null);
 const routes={mobileBattleMenu:'mobileMenuOpen',mobileRoster:'mobileRosterOpen',mobileGuide:'mobileGuideOpen',mobileUnitDetails:'mobileOrderToggle',dadOrders:'dadOrdersOpen',dadUnitDetails:'mobileOrderToggle'};
 for(const id of Object.keys(routes)){
  const sheet=page.locator('#'+id);
  if(id!==target&&await sheet.count()&&await sheet.evaluate(e=>e.open))await page.locator('#'+id+'Close').click();
 }
 if(routes[target]&&!await page.locator('#'+target).evaluate(e=>e.open))await page.locator('#'+routes[target]).click();
 await locator.click();
};
