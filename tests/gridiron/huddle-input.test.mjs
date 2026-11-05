import test from 'node:test';
import assert from 'node:assert/strict';
import {bindHuddleSwipe,swipePageDelta} from '../../daily_flyer/themes/pocket_gridiron_assets/huddle-input.js';

class Deck extends EventTarget {
 cards={style:{}};
 classList={add(){},remove(){}};
 querySelector(){return this.cards;}
 getBoundingClientRect(){return {width:360};}
 setPointerCapture(){}
 closest(){return this;}
}
function fire(target,type,props={}){
 const event=new Event(type,{cancelable:true});
 Object.assign(event,{pointerId:1,pointerType:'touch',clientX:200,clientY:100},props);
 target.dispatchEvent(event);return event;
}
test('horizontal swipes page in both directions; thumb jitter and vertical scrolling do not',()=>{
 assert.equal(swipePageDelta(-70,8,360),1);
 assert.equal(swipePageDelta(70,8,360),-1);
 assert.equal(swipePageDelta(8,3,360),0);
 assert.equal(swipePageDelta(50,70,360),0);
 assert.equal(swipePageDelta(36,2,280),-1);
});
test('a swipe turns one page and consumes the later click instead of calling a play',()=>{
 const deck=new Deck(),pages=[];bindHuddleSwipe(deck,delta=>pages.push(delta));
 fire(deck,'pointerdown');
 assert.equal(fire(deck,'pointermove',{clientX:120,clientY:106}).defaultPrevented,true);
 fire(deck,'pointerup',{clientX:110,clientY:106});
 assert.deepEqual(pages,[1]);assert.equal(deck.cards.style.transform,'');
 assert.equal(fire(deck,'click',{detail:1}).defaultPrevented,true);
 fire(deck,'pointerdown');fire(deck,'pointerup');
 assert.equal(fire(deck,'click',{detail:1}).defaultPrevented,false);
});
test('vertical scrolling and canceled gestures do not turn pages or leave a drag behind',()=>{
 const deck=new Deck(),pages=[];bindHuddleSwipe(deck,delta=>pages.push(delta));
 fire(deck,'pointerdown');
 assert.equal(fire(deck,'pointermove',{clientX:206,clientY:170}).defaultPrevented,false);
 fire(deck,'pointercancel');
 assert.deepEqual(pages,[]);assert.equal(deck.cards.style.transform,'');
 assert.equal(fire(deck,'click',{detail:1}).defaultPrevented,true);
 fire(deck,'pointerdown');fire(deck,'pointermove',{clientX:100});fire(deck,'lostpointercapture');
 assert.deepEqual(pages,[]);assert.equal(deck.cards.style.transform,'');
});
test('implicit capture transferring from a touched card to the deck keeps the swipe alive',()=>{
 const deck=new Deck(),pages=[];bindHuddleSwipe(deck,delta=>pages.push(delta));
 fire(deck,'pointerdown');fire(deck,'pointermove',{clientX:170});
 const transfer=new Event('lostpointercapture');
 Object.defineProperty(transfer,'target',{value:{tagName:'SPAN'}});
 Object.assign(transfer,{pointerId:1});deck.dispatchEvent(transfer);
 fire(deck,'pointercancel',{pointerId:2});
 fire(deck,'pointermove',{clientX:120});fire(deck,'pointerup',{clientX:100});
 assert.deepEqual(pages,[1]);
 assert.equal(fire(deck,'click',{detail:1}).defaultPrevented,true);
});
test('keyboard paging and assistive clicks remain available after touch gestures',()=>{
 const deck=new Deck(),pages=[];bindHuddleSwipe(deck,(delta,options)=>pages.push([delta,options?.keyboard]));
 fire(deck,'pointerdown');fire(deck,'pointercancel');
 assert.equal(fire(deck,'click',{detail:0}).defaultPrevented,false);
 assert.equal(fire(deck,'keydown',{key:'ArrowRight'}).defaultPrevented,true);
 assert.equal(fire(deck,'keydown',{key:'ArrowLeft'}).defaultPrevented,true);
 assert.deepEqual(pages,[[1,true],[-1,true]]);
});
