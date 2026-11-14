(function(){
var LINKS={
  apply:"https://www.tfaforms.com/4827504",
  email:"dts@ywamsanfrancisco.org",
  phone:"tel:4158856543",
  volunteer:"https://www.ywamsanfrancisco.org/volunteer",
  ma:"https://www.ywamsanfrancisco.org/mission-adventure",
  pantry:"https://www.ywamsanfrancisco.org/foodpantry",
  blog:"https://www.ywamsanfrancisco.org/blog?category=DTS"
};

// Each question maps to one dimension. Scores 0–3. Every answer carries an honest note.
var Q=[
 {dim:"hunger",context:"Start with the center of it all.",
  q:"When you think about God right now, which is closest?",
  o:[
   {t:"I'm hungry. I want to know Him, not just know about Him.",s:3,n:"That hunger is the whole point of DTS. The teaching, the prayer, the street — all of it is meant to feed it."},
   {t:"I love Jesus, but it's become routine. I want it alive again.",s:2,n:"A lot of people arrive exactly here. Rhythm, community and serving the poor have a way of waking faith back up."},
   {t:"I'm carrying real questions — some doubt, maybe some hurt.",s:2,n:"Honest questions are welcome at our table. DTS is a safe place to bring them, not a place you have to have it together."},
   {t:"I'm not sure where I am with God. Mostly curious.",s:1,n:"Curiosity is a good start. Coming to a Sunday Pop-Up Church or volunteering first might help you see what's here."}
  ]},
 {dim:"presence",context:"A Tuesday afternoon on Ellis Street.",
  q:"Someone is shouting on the corner. A man is asleep in a doorway. A neighbor you met last week waves. What happens in you?",
  o:[
   {t:"I want to learn the sleeping man's name.",s:3,n:"That instinct — toward the person, not the problem — is what the Tenderloin needs and what we'll help you grow."},
   {t:"I'm nervous, but I want to be the kind of person who stays.",s:2,n:"Nervous and willing is a great place to start. Nobody is sent out alone; you'll learn presence alongside staff who've been here for years."},
   {t:"Honestly, I'd want to walk faster.",s:1,n:"Thanks for being honest. Most of us had to unlearn hurry. This would be real stretching — worth talking through with the team."},
   {t:"I'd rather serve somewhere that feels safer.",s:0,n:"That's a fair and honest answer. There are YWAM DTSs all over the world — our team would gladly help you find one that fits."}
  ]},
 {dim:"witness",context:"Faith on your sleeve, not in someone's face.",
  q:"When someone doesn't believe what you believe, your first instinct is to…",
  o:[
   {t:"Get curious about their story before I say anything about mine.",s:3,n:"That's the posture we pray for: Jesus shown through listening, serving and loving first."},
   {t:"Share what Jesus means to me if they ask — and really listen.",s:2,n:"Good instinct. DTS will give you lots of practice doing both well, often over a cup of hot chocolate."},
   {t:"Make sure they hear the truth. It feels urgent.",s:1,n:"Your passion matters. Here, we'll invite you to lead with presence — to earn trust before words. It changes how the truth is heard."},
   {t:"Keep my faith to myself. It feels private.",s:1,n:"Totally understandable. DTS is a place to discover that sharing faith can be gentle, natural and never forced."}
  ]},
 {dim:"together",context:"Monastery life means shared life.",
  q:"For five months you'll share rooms, meals, dishes and prayer with people you didn't choose. That sounds…",
  o:[
   {t:"Like what I need. I grow best with people.",s:3,n:"You'll thrive in the rhythm of shared life — and help others thrive too."},
   {t:"Stretching but good. I'd need a quiet corner sometimes.",s:2,n:"Very normal. There's free time built into every week, and learning to ask for space is part of healthy community."},
   {t:"Hard. I'm private and recharge alone.",s:1,n:"Introverts do beautifully in DTS — but it's worth an honest conversation with staff about what living together looks like day to day."},
   {t:"Like a dealbreaker.",s:0,n:"Good to know now. Living in community is core to DTS, so a different kind of involvement — like volunteering — might be the better fit this season."}
  ]},
 {dim:"rhythm",context:"Ora et labora — pray and work.",
  q:"Morning prayer, worship, teaching, work, meals together, evening reflection. How does a daily rule of life land?",
  o:[
   {t:"I've been longing for rhythm. Yes please.",s:3,n:"You'll find the rhythm of DTS life a gift — a scaffold for the kind of life you're already reaching for."},
   {t:"I'm not naturally disciplined, but I'd love to be formed by it.",s:2,n:"That's exactly what a rule of life is for. It holds you on the days you can't hold yourself."},
   {t:"I tend to resist structure. I'd need grace.",s:1,n:"Grace is available. It helps to know going in that DTS is structured — and that the structure is meant to serve you."},
   {t:"I'd want my days to be my own.",s:0,n:"DTS asks for a lot of your days. A lighter commitment, like weekly volunteering, might suit this season better."}
  ]},
 {dim:"room",context:"The practical bit.",
  q:"DTS runs Jan 18 – Jun 4, 2027, including an outreach to cities overseas. No job or classes alongside. Cost is about $8,000, and the team helps with fundraising. Right now…",
  o:[
   {t:"I can clear the calendar. I'm ready to raise support or have it covered.",s:3,n:"Practically, you're ready. The next step is the application."},
   {t:"I could make it work with planning and a few hard conversations.",s:2,n:"That's how most people start. Our team can walk you through fundraising and the conversations with work, school or family."},
   {t:"I'm not sure. Work, school or family would need to shift.",s:1,n:"Worth talking it through with the team. Finances shouldn't stop someone from saying yes, and the timing may be more possible than it looks."},
   {t:"This season doesn't have room. Maybe a future one.",s:0,n:"That's wise to name. Future schools run regularly — and you can get to know us now through volunteering."}
  ]},
 {dim:"open",context:"Last one.",
  q:"If God used these five months to change something in you that you didn't plan on…",
  o:[
   {t:"Please. That's why I'd come.",s:3,n:"That openness is the soil DTS grows in."},
   {t:"Scary — but yes.",s:2,n:"Scary and yes is often the most honest form of faith. You won't be walking it alone."},
   {t:"I'd want to know what I'm signing up for first.",s:1,n:"Fair. A conversation with staff, or a visit, is a great way to see what the five months really look like."},
   {t:"I'd rather keep to what I came for.",s:0,n:"DTS tends to go deeper than people expect. It might help to talk honestly with the team about what you're hoping for."}
  ]}
];
var DIMS={hunger:"Hunger for God",presence:"Presence",witness:"Gentle witness",together:"Shared life",rhythm:"Rhythm",room:"Room in your life",open:"Openness"};

var OUT={
 yes:{badge:"Pull up a chair",title:"This sounds like <em>your season.</em>",
  body:"Your answers say you're hungry, willing to be close to real need, and ready to share life with others. That's the heart of a DTS on Ellis Street. The next step is simple: apply, and a real person will get back to you.",
  steps:[["Apply for January 2027","Starts Jan 18 · 5 months · Tenderloin + outreach",LINKS.apply],["Talk to the DTS team first","Email dts@ywamsanfrancisco.org","mailto:"+LINKS.email],["Read what DTS is like","Stories from the school",LINKS.blog]]},
 see:{badge:"Come and see",title:"Something's stirring. <em>Come and see.</em>",
  body:"There's real desire here, and a few places where you'd be stretched. That's normal — and the best way to discern is to taste the life before you commit to it. Spend a Sunday with us or serve a shift, then decide.",
  steps:[["Serve a shift with us","Food pantry, Ellis Room, hot chocolate on the street",LINKS.volunteer],["Try a Mission Adventure","A shorter taste of urban mission in SF",LINKS.ma],["Have a no-pressure conversation","We'd love to hear your story","mailto:"+LINKS.email]]},
 timing:{badge:"Heart ready, calendar not",title:"The heart's there. <em>The timing isn't — yet.</em>",
  body:"Your answers show real readiness for this kind of life. The practical side is what's uncertain. Before you rule it out, talk with our team — finances and timing are often more workable than they look, and future schools are always coming.",
  steps:[["Talk through fundraising & timing","We help every student explore support","mailto:"+LINKS.email],["Call the office","(415) 885-6543",LINKS.phone],["Get to know us now","Volunteer while you plan",LINKS.volunteer]]},
 notyet:{badge:"Not yet — and that's okay",title:"Maybe not this season. <em>That's holy too.</em>",
  body:"Your answers suggest DTS in the Tenderloin might not be the right fit right now. That's worth honoring, not forcing. You can still love your neighbor where you are — and our door on Ellis Street stays open.",
  steps:[["Talk with someone anyway","No agenda, just a conversation","mailto:"+LINKS.email],["Serve once and see","Food pantry & community volunteering",LINKS.volunteer],["Read stories from the neighborhood","The Love Your Neighbor(hood) series","https://www.ywamsanfrancisco.org/blog"]]}
};

window.mountDtsSurvey=function(root){
  var step=-1,ans=[];
  root.classList.add("dts-sv");
  function esc(s){return s.replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})}
  function render(){
    if(step<0) return intro();
    if(step>=Q.length) return result();
    var q=Q[step],prog="";
    for(var i=0;i<Q.length;i++)prog+='<i class="'+(i<=step?"on":"")+'"></i>';
    var html='<div class="sv-fade"><div class="sv-progress">'+prog+'</div><div class="sv-count"><span>Question '+(step+1)+' of '+Q.length+'</span><span>'+DIMS[q.dim]+'</span></div>'+
      '<div class="sv-context">'+q.context+'</div><h3>'+esc(q.q)+'</h3><div class="sv-opts">';
    q.o.forEach(function(o,i){html+='<button class="sv-opt'+(ans[step]===i?" sel":"")+'" data-i="'+i+'"><b>'+"ABCD"[i]+'</b><span>'+esc(o.t)+'</span></button>'});
    html+='</div><div class="sv-nav"><button class="sv-link" data-back>← Back</button>'+(ans[step]!=null?'<button class="sv-link" data-next>Next →</button>':'')+'</div></div>';
    root.innerHTML=html;
    root.querySelectorAll(".sv-opt").forEach(function(b){b.onclick=function(){
      ans[step]=+b.dataset.i;root.querySelectorAll(".sv-opt").forEach(function(x){x.classList.remove("sel")});b.classList.add("sel");
      setTimeout(function(){step++;render();scrollTop()},260)}});
    root.querySelector("[data-back]").onclick=function(){step--;render()};
    var n=root.querySelector("[data-next]");if(n)n.onclick=function(){step++;render()};
  }
  function scrollTop(){var r=root.getBoundingClientRect();if(r.top<0)root.scrollIntoView({behavior:"smooth",block:"start"});}
  function intro(){
    root.innerHTML='<div class="sv-fade"><div class="sv-kicker">✦ DTS fit survey</div><h2>Something brought you here. <em>Let\'s see if this is the season.</em></h2>'+
    '<p>Seven honest questions about how you\'d live, serve and learn with us on Ellis Street in the Tenderloin. No wrong answers, no pitch — just a clearer read on whether a Discipleship Training School fits where you are right now.</p>'+
    '<div class="sv-meta"><span>⏱ ~3 minutes</span><span>✦ 4 possible outcomes</span><span>🔒 Answers stay in your browser</span></div>'+
    '<button class="sv-btn" data-go>Find out if I\'m ready →</button></div>';
    root.querySelector("[data-go]").onclick=function(){step=0;render()};
  }
  function result(){
    var sc={},total=0;
    Q.forEach(function(q,i){var s=q.o[ans[i]].s;sc[q.dim]=s;total+=s});
    var key=(sc.room<=1&&total>=12)?"timing":total>=16?"yes":total>=9?"see":"notyet";
    var o=OUT[key];
    var sorted=Q.map(function(q,i){return{q:q,i:i,s:sc[q.dim]}}).slice().sort(function(a,b){return b.s-a.s});
    var strong=sorted.slice(0,2),stretch=sorted.filter(function(x){return x.s<=1}).slice(-2);
    if(!stretch.length)stretch=[sorted[sorted.length-1]];
    var bars="";Q.forEach(function(q){bars+='<div class="sv-bar"><span>'+DIMS[q.dim]+'</span><div><i data-w="'+(sc[q.dim]/3*100)+'"></i></div></div>'});
    var notes="";
    strong.forEach(function(x){notes+='<div class="sv-note"><strong>Already leaning in · '+DIMS[x.q.dim]+'</strong><p>'+x.q.o[ans[x.i]].n+'</p></div>'});
    stretch.forEach(function(x){if(strong.indexOf(x)<0)notes+='<div class="sv-note stretch"><strong>Where you\'d be stretched · '+DIMS[x.q.dim]+'</strong><p>'+x.q.o[ans[x.i]].n+'</p></div>'});
    var steps="";o.steps.forEach(function(s){steps+='<a class="sv-step" href="'+s[2]+'" target="_blank" rel="noopener"><div><span>'+s[0]+'</span><small>'+s[1]+'</small></div><em>→</em></a>'});
    var summary="Hi DTS team,\n\nI just took the 'Am I ready for DTS?' survey. My result: "+o.badge+".\n\n"+Q.map(function(q,i){return "• "+q.q+"\n  "+q.o[ans[i]].t}).join("\n")+"\n\nI'd love to talk about next steps.\n";
    root.innerHTML='<div class="sv-fade"><div class="sv-result-badge">'+o.badge+'</div><h2>'+o.title+'</h2><p>'+o.body+'</p>'+
     '<div class="sv-bars">'+bars+'</div><div class="sv-notes">'+notes+'</div>'+
     '<div class="sv-kicker" style="margin-top:6px">Your next step</div><div class="sv-steps">'+steps+'</div>'+
     '<div class="sv-actions"><a class="sv-btn" href="mailto:'+LINKS.email+'?subject='+encodeURIComponent("My DTS survey result: "+o.badge)+'&body='+encodeURIComponent(summary)+'">Send my answers to the DTS team</a><button class="sv-btn ghost" data-restart>Start over</button></div></div>';
    requestAnimationFrame(function(){setTimeout(function(){root.querySelectorAll(".sv-bar i").forEach(function(i){i.style.width=i.dataset.w+"%"})},60)});
    root.querySelector("[data-restart]").onclick=function(){step=-1;ans=[];render()};
  }
  render();
};
})();
