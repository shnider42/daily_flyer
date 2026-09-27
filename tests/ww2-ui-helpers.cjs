// Follow the visible mobile navigation before operating a secondary control.
exports.tap=async(page,locator)=>{
 await locator.waitFor({state:'attached'});
 const target=await locator.evaluate(e=>e.closest('dialog')?.id||null);
 const routes={mobileBattleMenu:'mobileMenuOpen',mobileRoster:'mobileRosterOpen',mobileGuide:'mobileGuideOpen',mobileUnitDetails:'mobileOrderToggle'};
 for(const id of Object.keys(routes)){
  const sheet=page.locator('#'+id);
  if(id!==target&&await sheet.count()&&await sheet.evaluate(e=>e.open))await page.locator('#'+id+'Close').click();
 }
 if(routes[target]&&!await page.locator('#'+target).evaluate(e=>e.open))await page.locator('#'+routes[target]).click();
 await locator.click();
};
