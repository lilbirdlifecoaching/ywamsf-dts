/* YWAM SF refresh — shared page interactions */
(function(){
  var nav=document.getElementById("nav"),bar=document.getElementById("progress"),fab=document.getElementById("fab"),hero=null;
  var links=[].slice.call(document.querySelectorAll(".navlinks a"));
  function onScroll(){var y=scrollY,h=document.documentElement.scrollHeight-innerHeight;
    nav.classList.toggle("shadow",y>10);bar.style.width=(y/h*100)+"%";
    fab.classList.toggle("show",y>innerHeight*.9);document.body.classList.toggle("scrolled",y>40);
    if(y<innerHeight&&hero)hero.style.transform="scale(1.06) translateY("+(y*.06)+"px)";
    var cur=null;links.forEach(function(a){var s=document.querySelector(a.getAttribute("href"));if(s&&s.getBoundingClientRect().top<140)cur=a});
    links.forEach(function(a){a.classList.toggle("cur",a===cur)});}
  addEventListener("scroll",onScroll,{passive:true});onScroll();

  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);
    e.target.querySelectorAll("[data-count]").forEach(function(el){var n=+el.dataset.count,t0=null;function f(t){t0=t0||t;var p=Math.min((t-t0)/1400,1);el.textContent=Math.round(n*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)})}})},{threshold:.15});
  document.querySelectorAll(".reveal").forEach(function(el,i){el.style.transitionDelay=(i%4)*70+"ms";io.observe(el)});

  document.querySelectorAll(".vow").forEach(function(v){v.addEventListener("click",function(){v.classList.toggle("flip")})});
  document.querySelectorAll(".qc").forEach(function(q){q.addEventListener("click",function(){q.classList.toggle("open")})});

  var H=[
    ["7:00","Morning prayer","Before the neighborhood wakes","The day starts in stillness: Scripture, silence, and prayer for each other and for the block. Monks called it Lauds. We call it getting rooted before we go out.",["Love of God","Silence","Scripture"]],
    ["8:00","One table","Breakfast together","Shared meals are where community actually happens. Someone burns the toast; someone else makes coffee for everyone. You'll know each other fast.",["Community","Hospitality"]],
    ["9:00","Teaching","Speaker of the week","Worship, then a new teacher each week on the foundations of faith: the character of God, identity, hearing His voice, the nations, justice and mercy.",["Training","Worship"]],
    ["12:30","Lunch & work","Pray and work","Dishes, floors, pantry boxes. Chores are formation too — humility learned with a mop in your hand.",["Humility in Action","Shared life"]],
    ["14:00","On the street","Local ministry","Food pantry, the Ellis Room, a thermos of hot chocolate on the corner. Mostly you'll listen, learn names, and pray when someone asks.",["Love of Neighbor","Presence"]],
    ["17:30","Dinner","Back at the table","Stories from the afternoon get told here — the funny ones, the heavy ones. Nobody carries the day alone.",["Community"]],
    ["19:00","Reflection","Small groups","Where did you see God today? Where did you miss Him? Small groups, mentorship and honest prayer close the day.",["Formation that Multiplies","Mentorship"]],
    ["21:00","Rest","…or the night shift","Most nights: rest. Some rain nights, the Ellis Room stays lit until morning for friends with nowhere dry to go.",["Sabbath","Ellis Room"]]
  ];
  var hoursEl=document.getElementById("hours"),card=document.getElementById("hourCard"),cur=0,auto;
  H.forEach(function(h,i){var b=document.createElement("button");b.innerHTML="<b>"+h[0]+"</b>"+h[1];b.onclick=function(){show(i);clearInterval(auto)};hoursEl.appendChild(b)});
  function show(i){cur=i;[].forEach.call(hoursEl.children,function(b,j){b.classList.toggle("on",i===j)});var h=H[i];
    card.innerHTML='<div class="t">'+h[0]+' · '+h[2]+'</div><h3>'+h[1]+'</h3><p>'+h[3]+'</p><div class="tag">'+h[4].map(function(t){return"<span>"+t+"</span>"}).join("")+'</div>';
    card.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:350,easing:"ease-out"});}
  show(0);
  new IntersectionObserver(function(es){es.forEach(function(e){clearInterval(auto);if(e.isIntersecting)auto=setInterval(function(){show((cur+1)%H.length)},5200)})},{threshold:.5}).observe(document.getElementById("day"));

  var IMG="https://images.squarespace-cdn.com/content/v1/56e87b56d51cd42c04a4fd37/";
  var M=[
    ["Training","i","4ddbffe2-014d-4194-a26e-e5fba257edad/Community%2520Lunch_VSCO.jpg","Spiritual formation and discipleship in community. Weekly worship and prayer times, small groups, one-on-one mentorship, local ministry in the Tenderloin, and a new speaker every week teaching foundational topics of faith.",["Worship & prayer","One-on-one mentorship","Local ministry","New teacher every week"]],
    ["Outreach","ii","3aac1bb8-94e7-49d4-be92-e9dad686c355/MKMR8140.jpg","You'll travel to the nations as a team to put into practice what you've learned — the skills and gifts you've been cultivating. We focus on sending teams into the urban centers of the world.",["Serve as a team","Urban-focused outreach","Share God's love","Discover your gifts"]],
    ["Debrief","iii","1779917437619-RYYYTGIULLW693NTZRZI/image-asset.jpeg","Time to reflect on your experiences and set you up for your next season — whether that's a job, college, joining YWAM, or however God is leading you.",["Reflection","Next-season planning","Commissioning","Further YWAM training"]]
  ];
  var tabs=document.getElementById("moveTabs"),panel=document.getElementById("movePanel");
  M.forEach(function(m,i){var b=document.createElement("button");b.textContent=m[0];b.onclick=function(){mv(i)};tabs.appendChild(b)});
  function mv(i){[].forEach.call(tabs.children,function(b,j){b.classList.toggle("on",i===j)});var m=M[i];
    panel.innerHTML='<div class="ph" style="background-image:url(\''+IMG+m[2]+'?format=1000w\')"></div><div class="txt"><div class="big">'+m[1]+'.</div><h3 style="font-size:clamp(28px,4vw,38px);margin:10px 0 14px">'+m[0]+'</h3><p style="font-size:18px">'+m[3]+'</p><ul>'+m[4].map(function(x){return"<li>"+x+"</li>"}).join("")+'</ul></div>';
    panel.animate([{opacity:.3},{opacity:1}],{duration:300});}
  mv(0);

  var track=document.getElementById("track");
  document.querySelectorAll(".arrows button").forEach(function(b){b.onclick=function(){track.scrollBy({left:+b.dataset.dir*Math.min(420,track.clientWidth*.85),behavior:"smooth"})}});

  var modal=document.getElementById("modal"),mounted=false;
  function openS(){if(!mounted){mountDtsSurvey(document.getElementById("survey"));mounted=true}modal.classList.add("open");document.body.style.overflow="hidden"}
  function closeS(){modal.classList.remove("open");document.body.style.overflow=""}
  document.querySelectorAll("[data-survey]").forEach(function(b){b.addEventListener("click",openS)});
  modal.querySelector(".modal-x").onclick=closeS;
  modal.addEventListener("click",function(e){if(e.target===modal)closeS()});
  addEventListener("keydown",function(e){if(e.key==="Escape")closeS()});
})();
