const targetDate =
new Date("2026-08-20T00:00:00");



function updateCountdown(){

const now=new Date();

const difference=targetDate-now;


if(difference<=0)return;



const days=Math.floor(
difference/(1000*60*60*24)
);


const hours=Math.floor(
difference%(1000*60*60*24)/
(1000*60*60)
);


const minutes=Math.floor(
difference%(1000*60*60)/
(1000*60)
);


const seconds=Math.floor(
difference%(1000*60)/
1000
);



daysEl.innerHTML=
String(days).padStart(2,"0");

hoursEl.innerHTML=
String(hours).padStart(2,"0");

minutesEl.innerHTML=
String(minutes).padStart(2,"0");

secondsEl.innerHTML=
String(seconds).padStart(2,"0");

}


const daysEl=document.getElementById("days");
const hoursEl=document.getElementById("hours");
const minutesEl=document.getElementById("minutes");
const secondsEl=document.getElementById("seconds");


setInterval(updateCountdown,1000);

updateCountdown();






// MENU


function openMenu(){

document
.getElementById("sidebar")
.classList.add("active");

}



function closeMenu(){

document
.getElementById("sidebar")
.classList.remove("active");

}






// SEITEN WECHSEL MIT ANIMATION


function changePage(page){


const transition=
document.getElementById("transition");


transition.classList.add("active");



setTimeout(()=>{


document
.querySelectorAll(".page")
.forEach(p=>{

p.classList.remove("active-page");

});



document
.getElementById(page)
.classList.add("active-page");



transition.classList.remove("active");


},500);



closeMenu();


}







// EVENTS


const events=[


{

date:"10.08.2026",

title:"Projekt Release",

description:"Das große Projekt startet."

},



{

date:"25.08.2026",

title:"Community Event",

description:"Gemeinsames Online Event."

}



];




function loadEvents(){


const list=
document.getElementById("event-list");



events.forEach(event=>{


list.innerHTML += `

<div class="event-card">

<h2>${event.title}</h2>

<p>${event.date}</p>

<p>${event.description}</p>

</div>

`;


});


}


loadEvents();
