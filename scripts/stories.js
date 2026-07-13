/* =====================================================
   STORY SYSTEM
===================================================== */



const stories = {


beginning:{


title:"The Beginning",


chapter:"Kapitel 01",


text:
`
Am Anfang entstand eine neue Welt.

Alte Kräfte erwachten und veränderten alles.

Dies ist der Beginn einer größeren Geschichte.
`


},





lostworld:{


title:"Lost World",


chapter:"Kapitel 02",


text:
`
Eine vergessene Welt wurde entdeckt.

Doch mit ihr kehren Gefahren zurück,
die niemand erwartet hätte.
`


},





secret:{


title:"The Secret",


chapter:"Kapitel 03",


text:
`
Eine Wahrheit kommt ans Licht.

Die Vergangenheit ist nicht das,
was alle glauben.
`


}


};







function openStory(id){


changePage(id);


}







function loadStories(){


Object.keys(stories).forEach(id=>{


const story =
stories[id];



const page =
document.getElementById(id);



if(!page){

return;

}



page.querySelector("h1")
.textContent =
story.title;



page.querySelector("h2")
.textContent =
story.chapter;



page.querySelector("p")
.textContent =
story.text;



});



}



loadStories();
