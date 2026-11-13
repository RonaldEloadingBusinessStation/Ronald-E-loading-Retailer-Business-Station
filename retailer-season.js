/* Manual seasonal theme switcher for Ronald E-Loading retailer portal.
   Change data-season on the <body> in retailer.html to one of the keys below. */
(function(){
  'use strict';
  const themes = {
    valentines:{label:'VALENTINE\'S DAY',kicker:'A SEASON OF LOVE',title:'Share the Love!',offer:'ENJOY GREAT VALUE ON EVERY LOAD',note:'More love, more savings, more connection. ❤️',emoji:'💗 💝 🌹',banner:'💗 VALENTINE\'S DAY SPECIAL! ✨ SHARE THE LOVE WITH EVERY LOAD 💝',message:'Celebrate the season of love with convenient and affordable loading. Thank you for choosing Ronald E-Loading! 💕',count:'VALENTINE\'S DAY COUNTDOWN',countTitle:'Love is in the air!',date:'February 14',month:1,day:14},
    summer:{label:'SUMMER DAY',kicker:'MAKE EVERY DAY BRIGHTER',title:'Hello, Summer!',offer:'POWER UP YOUR SUMMER WITH EASY LOADING',note:'Stay connected wherever summer takes you. ☀️',emoji:'☀️ 🌴 🌊',banner:'☀️ SUMMER DAY! 🌴 STAY CONNECTED AND ENJOY EVERY MOMENT 🌊',message:'Make the most of sunny days. Stay connected with easy and convenient loading from Ronald E-Loading.',count:'SUMMER COUNTDOWN',countTitle:'Your summer moment is coming!',date:'March 1',month:2,day:1},
    holyweek:{label:'SUMMER / HOLY WEEK',kicker:'A TIME TO REFLECT',title:'A Meaningful Holy Week',offer:'STAY CONNECTED WITH THE PEOPLE WHO MATTER',note:'Wishing you a peaceful and meaningful season. ✨',emoji:'🌿 🕊️ ✨',banner:'🌿 HOLY WEEK SEASON · WISHING YOU PEACE, HOPE, AND SAFE TRAVELS 🕊️',message:'May this Holy Week bring peace, reflection, and meaningful moments with your loved ones.',count:'HOLY WEEK SEASON COUNTDOWN',countTitle:'A meaningful season is approaching',date:'April 1',month:3,day:1},
    fiesta:{label:'SUMMER / FIESTA',kicker:'CELEBRATE TOGETHER',title:'Fiesta Celebration!',offer:'MORE CONNECTION FOR EVERY CELEBRATION',note:'Celebrate traditions, family, and community. 🎉',emoji:'🎉 🎊 🎈',banner:'🎉 FIESTA SEASON! 🎊 CELEBRATE MORE, STAY CONNECTED WITH RONALD E-LOADING',message:'Celebrate your community and special gatherings while staying connected with affordable loading.',count:'FIESTA SEASON COUNTDOWN',countTitle:'Let the celebration begin!',date:'May 1',month:4,day:1},
    rainy:{label:'INDEPENDENCE DAY / RAINY SEASON',kicker:'CONNECTED AND RESILIENT',title:'Proudly Connected!',offer:'STAY CONNECTED, RAIN OR SHINE',note:'Celebrate freedom and stay ready for every day. 🇵🇭',emoji:'🇵🇭 🌧️ ☔',banner:'🇵🇭 INDEPENDENCE DAY & RAINY SEASON · STAY CONNECTED, RAIN OR SHINE ☔',message:'Celebrate the spirit of freedom. Keep your loved ones close and stay connected through every season.',count:'INDEPENDENCE DAY COUNTDOWN',countTitle:'Celebrate freedom with us!',date:'June 12',month:5,day:12},
    midyear:{label:'MIDYEAR SALE / DISCOUNT',kicker:'LIMITED-TIME SAVINGS',title:'Midyear Sale!',offer:'MORE VALUE ON YOUR EVERYDAY LOAD',note:'Great deals to keep your business moving. 🏷️',emoji:'🏷️ 💸 ✨',banner:'🏷️ MIDYEAR SALE! ✨ ENJOY GREAT VALUE AND MORE SAVINGS ON LOAD 💸',message:'It is the perfect time to power up your loading business. Enjoy convenient service and great value with Ronald E-Loading.',count:'MIDYEAR SALE COUNTDOWN',countTitle:'A new wave of savings is coming!',date:'July 1',month:6,day:1},
    buwanwika:{label:'BUWAN NG WIKA',kicker:'IPAGMALAKI ANG ATING WIKA',title:'Buwan ng Wika',offer:'SERBISYONG ABOT-KAYA, UGNAYANG TULOY-TULOY',note:'Wika natin, yaman natin. Mabuhay ang kulturang Pilipino! 🇵🇭',emoji:'🇵🇭 🌺 📚',banner:'🇵🇭 BUWAN NG WIKA! IPAGMALAKI ANG WIKANG FILIPINO AT KULTURANG PILIPINO 🌺',message:'Ipagdiwang natin ang wikang Filipino at ang mayamang kulturang Pilipino. Maraming salamat sa pagtangkilik sa Ronald E-Loading!',count:'BUWAN NG WIKA COUNTDOWN',countTitle:'Ipagdiwang ang ating wika!',date:'August 1',month:7,day:1},
    christmas:{label:'CHRISTMAS SEASON',kicker:'THE SEASON OF GIVING',title:'Merry Christmas!',offer:'ENJOY UP TO 15% DISCOUNT LOAD',note:'A little more joy in every load 🎁',emoji:'🎄 🎅 🎁',banner:'🎄 MERRY CHRISTMAS! ✨ ENJOY UP TO 15% DISCOUNT LOAD 🎁',message:'Thank you for being part of Ronald E-Loading Business Station. Wishing you a bright and joyful holiday! ✨',count:'CHRISTMAS COUNTDOWN',countTitle:'Christmas is coming!',date:'December 25',month:11,day:25},
    halloween:{label:'HALLOWEEN SEASON',kicker:'A LITTLE SPOOKY, A LOT OF SAVINGS',title:'Happy Halloween!',offer:'NO TRICKS, JUST GREAT LOADING SERVICE',note:'Keep your connections alive… if you dare! 🎃',emoji:'🎃 🦇 👻',banner:'🎃 HAPPY HALLOWEEN! 👻 NO TRICKS, JUST GREAT LOADING SERVICE 🦇',message:'Have a safe and fun Halloween! Keep your connections alive with Ronald E-Loading.',count:'HALLOWEEN COUNTDOWN',countTitle:'The spooky season is coming!',date:'October 31',month:9,day:31},
    newyear:{label:'NEW YEAR SEASON',kicker:'A FRESH START, A STRONGER CONNECTION',title:'Happy New Year!',offer:'START THE YEAR CONNECTED',note:'New goals, new opportunities, and more connections. 🎆',emoji:'🎆 ✨ 🥂',banner:'🎆 HAPPY NEW YEAR! ✨ HERE\'S TO MORE CONNECTIONS AND NEW OPPORTUNITIES',message:'Wishing you success, happiness, and new opportunities. Thank you for growing with Ronald E-Loading!',count:'NEW YEAR COUNTDOWN',countTitle:'A brand-new year is coming!',date:'January 1',month:0,day:1}
  };
  const body=document.body;
  const key=(body.dataset.season||'christmas').toLowerCase();
  const t=themes[key]||themes.christmas;
  body.dataset.season=themes[key]?key:'christmas';
  const set=(selector,value)=>{const el=document.querySelector(selector);if(el&&value)el.textContent=value;};
  set('.christmas-announcement .christmas-marquee span',t.banner);
  document.querySelectorAll('.christmas-announcement .christmas-marquee span[aria-hidden="true"]').forEach(el=>el.textContent=t.banner);
  set('.hero-kicker',t.kicker);set('.hero-copy h1',t.title);
  set('.hero-copy p',t.offer);set('.hero-note',t.note);
  set('.christmas-message .eyebrow',t.label);set('.christmas-message h2',t.title);
  set('.christmas-message p',t.offer);set('.christmas-message small',t.message);
  set('.christmas-message-art',t.emoji.split(' ')[0]);set('.christmas-message-gifts',t.emoji);
  set('.countdown-kicker',t.count);set('.countdown-copy>strong',t.countTitle);
  set('.countdown-subtitle','Countdown to '+t.date);
  set('.christmas-countdown',null);
  const countdown=document.querySelector('.christmas-countdown');
  if(countdown){countdown.setAttribute('aria-label',t.count);countdown.dataset.countMonth=String(t.month);countdown.dataset.countDay=String(t.day);}
  const scene=document.querySelector('.hero-scene');
  if(scene){scene.innerHTML='<span class="season-scene-emoji" aria-hidden="true">'+t.emoji+'</span>';}
  const atmos=document.querySelector('.christmas-atmosphere');
  if(atmos){atmos.innerHTML='<span class="season-particle particle-one">'+t.emoji.split(' ')[0]+'</span><span class="season-particle particle-two">'+t.emoji.split(' ')[1]+'</span><span class="season-particle particle-three">'+t.emoji.split(' ')[2]+'</span>';}
  window.RONALD_SEASONAL_THEMES=themes;
})();
