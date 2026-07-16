/* ======================================================
   MAIN WEBSITE SYSTEM
====================================================== */




/* ======================================================
   SEITENWECHSEL
====================================================== */


function changePage(pageID){



const pages =
document.querySelectorAll(".page");



pages.forEach(page=>{


page.classList.remove(
"active-page"
);


});





const target =
document.getElementById(pageID);



if(target){


target.classList.add(
"active-page"
);


}



closeMenu();



}









/* ======================================================
   MENÜ SYSTEM
====================================================== */


function openMenu(){


document
.getElementById("sidebar")
.classList.add(
"open"
);


}





function closeMenu(){


const menu =
document.getElementById(
"sidebar"
);



if(menu){


menu.classList.remove(
"open"
);


}


}









/* ======================================================
   START
====================================================== */


window.addEventListener(

"DOMContentLoaded",

()=>{


changePage(
"home"
);



});
