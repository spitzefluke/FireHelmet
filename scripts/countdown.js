/* =====================================================
   COUNTDOWN SYSTEM
===================================================== */


const targetDate = new Date(
    "2026-08-10T00:00:00"
);



function updateCountdown(){


    const now = new Date();


    const difference =
    targetDate - now;



    if(difference <= 0){

        document.getElementById("days").textContent="00";
        document.getElementById("hours").textContent="00";
        document.getElementById("minutes").textContent="00";
        document.getElementById("seconds").textContent="00";

        return;

    }



    const days =
    Math.floor(
        difference /
        (1000 * 60 * 60 * 24)
    );



    const hours =
    Math.floor(
        (difference %
        (1000 * 60 * 60 * 24))
        /
        (1000 * 60 * 60)
    );



    const minutes =
    Math.floor(
        (difference %
        (1000 * 60 * 60))
        /
        (1000 * 60)
    );



    const seconds =
    Math.floor(
        (difference %
        (1000 * 60))
        /
        1000
    );



    document.getElementById("days").textContent =
    String(days).padStart(2,"0");


    document.getElementById("hours").textContent =
    String(hours).padStart(2,"0");


    document.getElementById("minutes").textContent =
    String(minutes).padStart(2,"0");


    document.getElementById("seconds").textContent =
    String(seconds).padStart(2,"0");


}



updateCountdown();


setInterval(
    updateCountdown,
    1000
);
