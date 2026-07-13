/* =====================================================
   MAIN SYSTEM
===================================================== */





const sidebar =
document.getElementById("sidebar");



const transition =
document.getElementById("transition");







/* ==========================
   MENU
========================== */



function openMenu(){


sidebar.classList.add(
"active"
);


}





function closeMenu(){


sidebar.classList.remove(
"active"
);


}









/* ==========================
   PAGE SYSTEM
========================== */



function changePage(pageID){



transition.classList.add(
"active"
);




setTimeout(()=>{



document
.querySelectorAll(".page")
.forEach(page=>{


page.classList.remove(
"active-page"
);


});





const page =
document.getElementById(pageID);



if(page){


page.classList.add(
"active-page"
);


}





transition.classList.remove(
"active"
);



closeMenu();



},500);



}









/* ==========================
   MOUSE PARALLAX
========================== */



const nebula =
document.querySelector(".nebula");




document.addEventListener(
"mousemove",
(e)=>{



if(!nebula){

return;

}



const x =
(e.clientX /
window.innerWidth -
0.5)
*20;



const y =
(e.clientY /
window.innerHeight -
0.5)
*20;




nebula.style.transform =

`
translate(
calc(-50% + ${x}px),
calc(-50% + ${y}px)
)
`;



});









/* ==========================
   PARTICLES
========================== */



function createParticles(){



const container =
document.createElement(
"div"
);



container.className =
"particles";



document.body.appendChild(
container
);




for(let i=0;i<80;i++){



const particle =
document.createElement(
"span"
);



particle.className =
"particle";



particle.style.left =
Math.random()*100+"vw";



particle.style.top =
Math.random()*100+"vh";



particle.style.animationDuration =
(5+
Math.random()*10)
+"s";



container.appendChild(
particle
);



}


}



createParticles();









/* ==========================
   LOAD EFFECT
========================== */



window.addEventListener(
"load",
()=>{


document.body.classList.add(
"loaded"
);



});
