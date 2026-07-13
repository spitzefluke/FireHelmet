/* ======================================
   STORY SYSTEM
====================================== */





function openStory(id){



const story =
stories.find(
item=>item.id===id
);




if(!story){

return;

}




document.getElementById(
"book-title"
).textContent =
story.title;





document.getElementById(
"book-text"
).textContent =
story.text;





changePage(
"book-reader"
);



}
