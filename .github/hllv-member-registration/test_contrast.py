"""Run the full signup journey suite with computed text contrast assertions in both themes."""
from pathlib import Path
source=Path('.github/hllv-member-registration/test_browser.py').read_text()
anchor="  for width in [320,390,1280]:"
assert source.count(anchor)==1
check="""  for selector in ['#sgSignupEmail','#sgSignupPassword','#sgSignupConfirm','#sgVerificationEmail']:
   result=page.locator(selector).evaluate(\"e=>{const s=getComputedStyle(e);return {fg:s.color,bg:s.backgroundColor}}\")
   def luminance(css):
    values=[float(n) for n in __import__('re').findall(r'[0-9.]+',css)[:3]]
    linear=[v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in values]
    return sum(a*b for a,b in zip(linear,[.2126,.7152,.0722]))
   fg,bg=luminance(result['fg']),luminance(result['bg'])
   assert (max(fg,bg)+.05)/(min(fg,bg)+.05)>=4.5,(mode,selector,result)
   assert (bg<.12 if mode=='dark' else bg>.8),(mode,selector,result)
"""
source=source.replace(anchor,check+anchor)
exec(compile(source,'.github/hllv-member-registration/test_browser.py','exec'),{'__name__':'__main__'})
