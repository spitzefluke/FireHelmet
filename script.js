/* ===========================================================
   COUNTDOWN WEBSITE V2
   script.js
   Teil 1
=========================================================== */


/* ===========================================================
   EINSTELLUNGEN
=========================================================== */

const CONFIG = {

    countdownDate: "2026-08-10T00:00:00",

    animationDuration: 500

};



/* ===========================================================
   ELEMENTE
=========================================================== */

const sidebar = document.getElementById("sidebar");
const transition = document.getElementById("transition");

const days = document.getElementById("days");
const hours = document.getElementById("hours");
const minutes = document.getElementById("minutes");
const seconds = document.getElementById("seconds");



/* ===========================================================
   COUNTDOWN
=========================================================== */

function updateCountdown() {

    const now = new Date();

    const target = new Date(CONFIG.countdownDate);

    const distance = target - now;

    if (distance <= 0) {

        days.textContent = "00";
        hours.textContent = "00";
        minutes.textContent = "00";
        seconds.textContent = "00";

        return;

    }

    const d = Math.floor(distance / (1000 * 60 * 60 * 24));

    const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

    const s = Math.floor((distance % (1000 * 60)) / 1000);

    days.textContent = String(d).padStart(2, "0");
    hours.textContent = String(h).padStart(2, "0");
    minutes.textContent = String(m).padStart(2, "0");
    seconds.textContent = String(s).padStart(2, "0");

}

updateCountdown();

setInterval(updateCountdown,1000);



/* ===========================================================
   MENÜ
=========================================================== */

function openMenu(){

    sidebar.classList.add("active");

}

function closeMenu(){

    sidebar.classList.remove("active");

}



/* ===========================================================
   SEITENSYSTEM
=========================================================== */

function changePage(pageId){

    transition.classList.add("active");

    setTimeout(()=>{

        document.querySelectorAll(".page").forEach(page=>{

            page.classList.remove("active-page");

        });

        const page = document.getElementById(pageId);

        if(page){

            page.classList.add("active-page");

        }

        closeMenu();

        transition.classList.remove("active");

    },CONFIG.animationDuration);

}



/* ===========================================================
   STORY SYSTEM
=========================================================== */

function openStory(storyID){

    changePage(storyID);

}



/* ===========================================================
   PARALLAX
=========================================================== */

const nebula = document.querySelector(".nebula");

document.addEventListener("mousemove",(e)=>{

    if(!nebula) return;

    const x = (e.clientX/window.innerWidth-.5)*20;

    const y = (e.clientY/window.innerHeight-.5)*20;

    nebula.style.transform =
        `translate(calc(-50% + ${x}px),${y}px)`;

});



/* ===========================================================
   KARTEN ANIMATION
=========================================================== */

const cards = document.querySelectorAll(

".story-book,.character-card,.social-card,.partner-card"

);

cards.forEach(card=>{

    card.addEventListener("mouseenter",()=>{

        card.style.transform="translateY(-15px) scale(1.03)";

    });

    card.addEventListener("mouseleave",()=>{

        card.style.transform="translateY(0px) scale(1)";

    });

});



/* ===========================================================
   BUTTON RIPPLE
=========================================================== */

document.querySelectorAll("button").forEach(button=>{

    button.addEventListener("click",(e)=>{

        const ripple=document.createElement("span");

        ripple.classList.add("ripple");

        ripple.style.left=e.offsetX+"px";

        ripple.style.top=e.offsetY+"px";

        button.appendChild(ripple);

        setTimeout(()=>{

            ripple.remove();

        },600);

    });

});



/* ===========================================================
   TASTATUR
=========================================================== */

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        closeMenu();

    }

});



/* ===========================================================
   LADEANIMATION
=========================================================== */

window.addEventListener("load",()=>{

    document.body.classList.add("loaded");

});



/* ===========================================================
   INITIALISIERUNG
=========================================================== */

console.log(

"%cCountdown Website v2",

"color:#4da3ff;font-size:20px;font-weight:bold;"

);

console.log("Website erfolgreich geladen.");

/* ===========================================================
   COUNTDOWN WEBSITE V2
   script.js
   Teil 2
=========================================================== */


/* ===========================================================
   CINEMATIC PAGE EFFECT
=========================================================== */


document.querySelectorAll(".page").forEach(page=>{

    page.addEventListener("animationend",()=>{

        page.classList.remove("page-animation");

    });

});



function cinematicTransition(){

    document.body.classList.add("cinematic");

    setTimeout(()=>{

        document.body.classList.remove("cinematic");

    },800);

}





/* ===========================================================
   STORY BOOK EFFECT
=========================================================== */


const storyBooks =
document.querySelectorAll(".story-book");


storyBooks.forEach(book=>{


    book.addEventListener("click",()=>{


        book.classList.add("opening");


        setTimeout(()=>{


            book.classList.remove("opening");


        },700);


    });


});







/* ===========================================================
   MOUSE LIGHT EFFECT
=========================================================== */


const light =
document.createElement("div");


light.className="mouse-light";


document.body.appendChild(light);



document.addEventListener(
"mousemove",
(e)=>{


light.style.left =
e.clientX+"px";


light.style.top =
e.clientY+"px";


});


document.addEventListener(
"mouseleave",
()=>{

light.style.opacity="0";

});


document.addEventListener(
"mouseenter",
()=>{

light.style.opacity="1";

});








/* ===========================================================
   PARTICLE SYSTEM
=========================================================== */


function createParticles(){


const container =
document.createElement("div");


container.className="particles";


document.body.appendChild(container);



for(let i=0;i<80;i++){


const particle =
document.createElement("span");



particle.className="particle";



particle.style.left =
Math.random()*100+"vw";


particle.style.top =
Math.random()*100+"vh";



particle.style.animationDuration =
(5+Math.random()*10)+"s";



particle.style.animationDelay =
Math.random()*5+"s";



container.appendChild(particle);


}


}



createParticles();







/* ===========================================================
   SCROLL REVEAL
=========================================================== */


const revealElements =
document.querySelectorAll(
".story-book,.character-card,.social-container a"
);



const observer =
new IntersectionObserver(
(entries)=>{


entries.forEach(entry=>{


if(entry.isIntersecting){


entry.target.classList.add(
"show"
);


}


});


},
{

threshold:0.15

});



revealElements.forEach(el=>{

observer.observe(el);

});









/* ===========================================================
   MOBILE TOUCH MENU
=========================================================== */


let touchStartX=0;


document.addEventListener(
"touchstart",
(e)=>{


touchStartX =
e.changedTouches[0].screenX;


});



document.addEventListener(
"touchend",
(e)=>{


let touchEndX =
e.changedTouches[0].screenX;



if(touchEndX-touchStartX > 100){


openMenu();


}



if(touchStartX-touchEndX > 100){


closeMenu();


}



});









/* ===========================================================
   RANDOM BACKGROUND MOVEMENT
=========================================================== */


const backgroundLayers =
document.querySelectorAll(
".stars,.stars2,.nebula"
);



setInterval(()=>{


backgroundLayers.forEach(
(layer,index)=>{


const moveX =
(Math.random()-0.5)*20;


const moveY =
(Math.random()-0.5)*20;



layer.style.transform +=
`
translate(
${moveX}px,
${moveY}px
)
`;



});



},8000);









/* ===========================================================
   ACTIVE MENU HIGHLIGHT
=========================================================== */


const menuLinks =
document.querySelectorAll(
".sidebar a"
);



menuLinks.forEach(link=>{


link.addEventListener(
"click",
()=>{


menuLinks.forEach(item=>{

item.classList.remove(
"selected"
);

});


link.classList.add(
"selected"
);


});


});








/* ===========================================================
   IMAGE LAZY LOAD SUPPORT
=========================================================== */


document.querySelectorAll("img")
.forEach(img=>{


img.loading="lazy";


});








/* ===========================================================
   SAFE RESIZE
=========================================================== */


window.addEventListener(
"resize",
()=>{


if(window.innerWidth > 900){


document.body.classList.remove(
"mobile"
);


}

else{


document.body.classList.add(
"mobile"
);


}



});







/* ===========================================================
   WEBSITE READY
=========================================================== */


window.addEventListener(
"load",
()=>{


setTimeout(()=>{


document.body.classList.add(
"ready"
);


},300);



});
