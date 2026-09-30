const {test}=require('node:test'),assert=require('node:assert/strict');
const {comparison,relationship}=require('../daily_flyer/year_two_view.js');
test('plain-English changes honor lower-is-better and missing pairs',()=>{
  assert.match(comparison([{delta:-2},{delta:3},{delta:0},{delta:null}],-1),/1 improved, 1 declined and 1 stayed level/);
  assert.match(comparison([{delta:null}],1),/Missing data is not a slump/);
  assert.match(comparison([],1),/No selected players/);
});
test('neutral metrics describe numerical movement, not better / worse',()=>{
  assert.match(comparison([{delta:4},{delta:-1}],0),/1 rose numerically, 1 fell numerically/);
});
test('relationship language never substitutes good / bad for numerical direction',()=>{
  assert.match(relationship(-.4,'ERA','later performance'),/higher ERA tended to have lower/);
  assert.match(relationship(.3,'OPS','later performance'),/higher OPS tended to have higher/);
  assert.match(relationship(.05,'OPS','success'),/little rank relationship/);
  assert.match(relationship(null,'OPS','success'),/not enough comparable data/);
});
