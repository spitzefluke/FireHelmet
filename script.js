// ==========================
// COUNTDOWN
// ==========================


// Ziel: 10. August 2026 00:00 Uhr

const targetDate =
new Date("2026-08-10T00:00:00");



function updateCountdown(){


const now =
new Date();



const difference =
targetDate - now;



if(difference <= 0){

document.getElementById("days").innerHTML="00";
document.getElementById("hours").innerHTML="00";
document.getElementById("minutes").innerHTML="00";
document.getElementById("seconds").innerHTML="00";

return;

}



const days =
Math.floor(
difference /
(1000*60*60*24)
);



const hours =
Math.floor(
(difference %
(1000*60*60*24))
/
(1000*60*60)
);



const minutes =
Math.floor(
(difference %
(1000*60*60))
/
(1000*60)
);



const seconds =
Math.floor(
(difference %
(1000*60))
/
1000
);



document.getElementById("days").innerHTML =
String(days).padStart(2,"0");



document.getElementById("hours").innerHTML =
String(hours).padStart(2,"0");



document.getElementById("minutes").innerHTML =
String(minutes).padStart(2,"0");



document.getElementById("seconds").innerHTML =
String(seconds).padStart(2,"0");


}



setInterval(updateCountdown,1000);

updateCountdown();






// ==========================
// MENU
// ==========================



function openMenu(){

document
.getElementById("sidebar")
.classList
.add("active");

}



function closeMenu(){

document
.getElementById("sidebar")
.classList
.remove("active");

}
