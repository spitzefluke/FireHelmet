/* ======================================================
   STORY SYSTEM
====================================================== */



let currentStory = null;



let currentChapter = null;





/* ======================================================
   STORY ARCHIV LADEN
====================================================== */


function loadStories(){


const container =
document.getElementById(
"story-grid"
);



if(!container) return;



container.innerHTML = "";



stories.forEach(story => {



const card =
document.createElement("div");



card.className =
"story-card";



card.onclick = () => {

openStory(story.id);

};





card.innerHTML = `

<img 
src="${story.cover}"
alt="${story.title}">



<h2>

${story.title}

</h2>



<p>

${story.description}

</p>

`;



container.appendChild(card);



});



}







/* ======================================================
   STORY ÖFFNEN
====================================================== */


function openStory(id){



const story =
stories.find(
item => item.id === id
);



if(!story) return;



currentStory = story;




document.getElementById(
"detail-cover"
).src =
story.cover;



document.getElementById(
"detail-title"
).textContent =
story.title;



document.getElementById(
"detail-description"
).textContent =
story.description;




loadChapters();



changePage(
"story-detail"
);



}








/* ======================================================
   KAPITEL LADEN
====================================================== */


function loadChapters(){


const container =
document.getElementById(
"chapter-list"
);



container.innerHTML = "";





currentStory.chapters.forEach(chapter => {



const card =
document.createElement("div");



card.className =
"chapter-card";



card.onclick = () => {


openChapter(
chapter.id
);


};




card.innerHTML = `


<h3>

${chapter.title}

</h3>



<span class="language">

${chapter.language}

</span>



`;



container.appendChild(card);



});



}







/* ======================================================
   KAPITEL ÖFFNEN
====================================================== */


function openChapter(id){



const chapter =
currentStory.chapters.find(

item => item.id === id

);



if(!chapter) return;




currentChapter = chapter;





document.getElementById(
"book-title"
).textContent =
chapter.title;



document.getElementById(
"book-language"
).textContent =
chapter.language;



document.getElementById(
"book-text"
).textContent =
chapter.text;




changePage(
"book-reader"
);



}








/* ======================================================
   START
====================================================== */


window.addEventListener(

"DOMContentLoaded",

()=>{


loadStories();


}

);
