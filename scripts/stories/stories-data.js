/* ======================================
   STORY DATENBANK
====================================== */

const stories = [
  {
    id: "treasure",
    title: "The Legendary Treasure",
    cover: "scripts/Legendary.png",
    description:
      "Eine mysteriöse Reise auf der Suche nach einem legendären Schatz. Ein Abenteuer voller Geheimnisse, Gefahren und vergessener Geschichten.",

    // Welche Charaktere aus CHARACTER_DATABASE (siehe
    // scripts/characters/characters-data.js) in diesem Logbuch
    // vorkommen - daraus baut sich die Characters-Seite automatisch.
    characters: ["dave", "finjan", "dean", "andi", "julian"],

    chapters: [
      {
        id: "treasure-de-01",
        title: "Kapitel 1 - Die seltsame Fracht",
        language: "Deutsch",
        text: `
        
1540 an einem Hafen in einem kleinen Dorf namens Romna, liegt ein stark rot bemaltes Schiff. 
Es hat schwarze Verzierungen und gehört dem Captain Schifffahrer Dave. 
Zur heutigen Zeit würde man ihn als Rentner und durchgeknallten zerbrechlichen Mann beschreiben, doch zu dieser Zeit ist er ein ehrenvoller, abenteuerlustiger und erfahrener Schifffahrer.
Seine Crew nennt ihn auch Fliezpiepenheimer. 

Heute ist es am Hafen etwas sonderbar, da die Crew das erstemal ein wichtige und gut bezahlte Fracht verschiffen sollen. 
Die Crew schrubbt das Deck und bereitet schon alles auf die Ankunft der wichtigen Ladung vor. 
Nach kurzer Zeit trifft die erwartete Ladung ein und die Crew macht sich bereit sie zu transportieren.
Doch der Captain hat ein mulmiges Gefühl bei der Sache. 
Die Ladung ist in eine massive Metallbox mit 5 Schlössern verstaut. "Was da wohl drin ist?" denken sich alle. 
Die zwei Männer die die Fracht hergebracht haben, warnten die Crew deutlich die Box unter keinen Umständen aufzumachen, da dies den Tod aller Crew Mitglieder bedeuten würde. 
Dem Captain ist dies nicht ganz so geheuer, jedoch braucht die Crew dringend das Geld was es für die Auslieferung gibt, weshalb er die Fracht aufladen lässt. 
Die Crew ist arm geworden, da Ändii, ein spielsüchtiges Crewmitglied, die Schiffskasse verspielt hat.
Die zwei Männer verschwieden schnell und hinterlassen nur einen leeren Hafen.

`,
      },
      {
        id: "treasure-de-02",
        title: "Kapitel 2 - Ein neues Abenteuer",
        language: "Deutsch",
        text: `

Beladen mit der seltsamen Fracht stich das Schiff in See und ein neues Abenteuer beginnt. 
Auf ihrer Reise über die weiten Meere stellt sich die Crew vielen Herausforderungen. 
Finjan Backbeard, das jüngste und frechste Mitglied der Crew ist trotz dieser überaus sonderbaren Eigenschaften ihr wichtigster Mann.
Er ärgert den Captain der Mannschaft und treibt viel Schabernack, ist aber ein Meister der Beobachtung.
Oben auf seinem Auskuck überblickt er das weite, schon oft führten seine präzisen Beobachtungen dazu, dass die Crew Gefahren aus dem Weg gehen konnte.
Sein Blick schweift über das weite Meer und die Flagge des Schiffes weht im Wind, durch sie erkennt man Daves Mannschaft schon auf weite Entfernung.
Auch dies ist Finjan zu verdanken, denn er hat sie entworfen. 
Abgebildet sind ein muskulöser Mann hinter dem ein Schiff zu erkennen ist, das ihrem täuschend ähnlich sieht.

Langsam neigt sich der erste Tag ihrer Reise dem Ende zu, die Crew legt sich in ihre Kojen und als auch die letzten Sonnenstrahlen verblassen begibt sich auch Dave in seine Kajüte.
Die See ist ausnahmsweise einmal ruhig und Dave gibt den Befehl den Anker zu senken.
Gedankenverloren sitzt er  auf seinem Sessel und denkt über ihre Reise und die merkwürdige Fracht nach die sie geladen haben. 
Doch seine Gedanken werden abrupt durch eine Erschütterung gestört, irgendetwas muss gegen das Schiff gestoßen sein. 
Er greift seinen eisernen Säbel der mit der mit goldenen Gravierungen verziert ist und tritt kampfbereit auf das Deck des Schiffes. 
Der Rest der Crew hat sich dort schon versammelt und Dave drängelt sich durch die Menge stinkender Seeleute. 
Als er am vorderen Ende angekommen ist, sieht er sie zwei Meeresbewohner, sogenannte "Sauluppen" kämpfen miteinander. 
Diese Tiere sind eine merkwürdige Mischung aus Wal und Schwein, grundsätzlich sind sie friedlich aber es handelt sich hier anscheinend um zwei Weibchen. 
Diese sind aggressiver als ihre Männlichen Artgenossen und verteidigen ihr Territorium sehr aggressiv. 
Allerdings ist irgendwas bei diesen Exemplaren anders, aber was nur? 
Die Zeit darüber nachzudenken bleibt Dave verwehrt da Finjan ihn in die Seite stuppst. 
Grinsend fragt ihn dieser: "Hey Captain eine gewisse ähnlichkeit haben sie schon mit diesen Tieren, sind das entfernte Verwandte von ihnen?" lachend tätschelt Dave Finjans Schulter und erwidert: "Pass auf deine Zunge auf sonst kannst du gleich Bekanntschaft mit meinen angeblichen Verwandten machen!". 
Die Crew schaut noch ein bisschen dem Treiben der Sauluppen zu und verzieht sich danach wieder in ihre Kojen.

`,
      },
      {
        id: "treasure-de-03",
        title: "Kapitel 3 - Ein ungewissener Weg",
        language: "Deutsch",
        text: `

Als Dave am nächsten Morgen aufwacht scheint alles in Ordnung zu sein, das Schiff schaukelt ruhig in den Wellen und und die ersten Sonnestrahlen scheinen durch die Fenster seiner Kajüte. 
Als Dave allerdings aus seiner Kajüte auf das Deck geht kommt ihm direkt sein Steuermann Dean Silentmouth entgegen. 
Dean ist schon seit vielen Jahren Steuermann ihres Schiffes und einer von Daves engsten vertrauten, es gibt wenige die sich auf den Ozeanen der Welt sogut auskennen wie er. 
Obwohl er nicht viel redet vertraut Dave ihm voll und ganz. 
Dean zeigt mit seinem Finger aufgeregt zum Rand des Schiffes, er wirkt schon fast verängstigt. 
Dies beunruhigt Dave aber er nimmt sich zusammen und schreitet langsam zum Rand des Deckes. 
Als er dort ankommt verschlägt es ihm schon fast die Sprache, das Wasser hat sich in eine rote Pfütze verwandelt, und in dieser schwimmen die Überreste von einem der Sauluppen. 
Dave ist erschüttert in seinen langen Jahren als Seefahrer hat er noch nie gesehen das sich diese Tiere gegenseitig abmurksen und auch die Wunden am Kadaver des Tieres stimmen nicht mit denen überein die ein Sauluppen einem anderen zufügen kann. 
Allerdings hat Dave keine Zeit sich darüber weiter Gedanken zu machen, er gibt den Befehl den Anker einzuziehen und die Segel zu hissen. 
Ihre Reise geht weiter. 
Gegen Mittag meldet sich Finjan aus dem Ausguck: "Hey Captain dahinten zieht ein echt mieses Unwetter auf... fast so mies wie ihre Laune manchmal.". 
Dave in Gedanken versunken greift zum Fernglas um sich das einmal näher anzugucken: "Da müssen wir durch." Sagt er: "Zieht das Großsegel ein und verstaut alles was nicht niet und nagelfest ist!". 
Finjan schaut ihn mit großen Augen an: "Na gut Captain wir sehen uns auf der anderen Seite... oder vielleicht auch nicht."
Der Sturm tobt, Wasser spritzt an den Seiten des Deckes hoch und die Mannschaft taumelt benommen über das Deck. 
Der Himmel ist von pechschwarzen Wolken überzogen die im Minutentakt von Blitzen durchbrochen werden. 
Und zu allem Übel zieht nun auch noch Nebel auf, die Mannschaft verliert fast komplett die Orientierung, sie können nur erahnen wo sie langfahren, zum Glück haben sie einen Kompass der ihnen den Weg zeigt... aber wo ist der Kompass? 
Gerade lag er noch neben Dave und Dean auf einem Pult doch nun ist er weg. 
Dave prescht wie ein wilder Hengst übers Deck und sucht verzweifelt nach dem Kompass. 
Es dauert zwar eine Zeit aber er findet ihn... oder zu mindest das was von ihm übrig ist, irgendwer muss in der Unruhe des Sturms auf den Kompass getreten sein, dieser liegt zerschmettert in seine Einzelteile am Boden. 
"Wie sollen wir jetzt bloß weiterkommen?", denkt sich Dave. 
Der Storm tobt weiterhin und unter der Crew macht sich Panik breit. 
In einer solchen Situation waren sie noch nie, ohne Kompass sind sie völlig orientierungslos. 
Dave probiert in dem ganzen Chaos ruhig zu bleiben, allerdings fällt es auch ihm trotz seiner Jahre langen Erfahrung schwer einen kühlen Kopf zu bewahren. 
Durch das Kreischen des Sturms hört die Crew plötzlich seltsame Geräusche, laute die ihnen das Blut in den Adern gefrieren lassen. 
Ein Schatten beugt sich über den Rumpf des Schiffes, zwei glühend rote Augen starren Dave in die Seele.


`,
      },
      {
        id: "treasure-de-04",
        title: "Kapitel 4 - Entführung",
        language: "Deutsch",
        text: `

Bevor sich Dave versieht packt ein riesiger Tentakel ihn und zieht ihn über das Deck, seine Männer versuchen verzweifelt mit Musketen und Kanonen das Ungetüm zu fall zu bringen und Dave aus dessen Tentakeln zu befreien. 
Doch zur Verzweiflung aller haben ihre Angriffe so gut wie keine Wirkung auf das Monster. 
Dave wärt sich mit allem was er hat, er tritt und schlägt auf den Tentakel ein aber es bringt nichts. 
Das Ungetüm zieht in Unterwasser und entfernt sich von dem Schiff. Dave verliert langsam das Bewusstsein, die Luft wird knap und ihm wird schwarz vor Augen. 
Als Dave wieder zusichkommte hatte er nur noch verschwommene Erinnerungen von dem was passiert war. 
Das er nicht mehr auf dem Schiff war wusste er, aber wie lange er schon weg war wusste er nicht. 
Geschichtsschreiber spekulieren heute noch ob diese plötzliche Erinnerungslücke durch das traumatische Erlebnis oder einfach nur durch Daves alter verursacht worden ist. 
Dave jedenfalls fand sich nach seinem aufwachen in einer Höhle wieder, aber anders als man erwarten würde war es dort nicht dunkel, die Höhle wurde von einem bläulichem schimmer erleuchtet. 
Dave tastete sich vorsichtig vorwärts, er erkannte die Umrisse von zerstörten Schiffen die überall in der Höhle verteilt waren.
Plötzlich nahm er in der Dunkelheit eine Bewegung war ein großer Schatten der ihm schrecklicherweise bekannt vorkam. 
Das Ungetüm bewegte sich durch die Höhle fast so als ob es etwas suchen würde, allerdings blieb Dave keine Zeit darüber nachzudenken er musste einen Ausgang finden.
Die Crew war erschüttert. Erst ging ihr Kompass kaputt jetzt war auch noch ihr Captain weg. 
Die Stimmung war im Keller und selbst Finians Scherze konnten sie wieder aufhellen. 
Sie alle waren traurig, aber auch entschlossen keiner wollte Dave zurücklassen. 
Dean setzte Kurs in Richtung Deadmansisland, das ist der einzige Ort wo das Mistvieh Dave hinbringen könnte.
Und so begab sich Daves Crew entschlossen auf eine Rettungsmission.
Der Wind war gut und das Schiff schmiegte sich gleisend durch das blaue Wasser. 
Alles wirkte ruhig bis Finian aus dem Ausguck Meldung gab: "Insel voraus!"

`,
      },
      {
        id: "treasure-de-05",
        title: "Kapitel 5 - Die Rettung",
        language: "Deutsch",
        text: `

Dave kriechte weiter über den Boden und suchte nach einem Ausgang das seltsame blaue Licht half ihm sich in der Höhle zurechtzufinden. 
Mit der Zeit verlor er allerdings das Zeitgefühl er wusste nicht, ob er schon Stunden, Tage oder Wochen über den Boden krabbelte. 
Seine Hände ertasteten etwas in der Dunkelheit etwas rundes als Dave sich das Objekt genauer anschaute durchlief ihn ein kurzer Freudenschock, es war ein Kompass! 
Vor lauter Freude rollte sich Dave auf dem Boden... und rollte über einen Haufen Knochen. 
Das Knacken dieser war in der Stille der Höhle kaum zu überhören, und auch das Biest hörte es, es baute sich vor Dave auf, seine roten Augen leuchteten bestiealisch. 
Booooom ein Krachen durchzog die Höhle und eine der Felswände fiel in sich zusammen, das Sonnenlicht blendete Dave, erst nach ein paar Sekunden sah er, was da durch die Wand gekommen war. 
Es war sein Schiff! Seine Crew! Sie hatten es wohl mit dem Schwarzpulver das noch auf dem Schiff war geschafft ein Loch in die Wand zu sprengen. 
"Macht es fertig", schrie es vom Schiff und Dave hörte weitere Explosionen. 
Das Biest hatte keine Wahl und zog sich weiter in die Höhle zurück und probierte mit seinen Tentakeln Dave zu packen, dieser rannte auf sein Schiff zu. 
Im letzten Moment schaffte er es die Hand von zweien seiner Leute zu greifen. 
Finian und Julian hielten seine Hand fest und sahen nicht so aus als ob sie loslassen würden: "Halt dich fest Captain, sonst bist du gleich Monstertatar!" sagte Finian lässig. 
Knapp aber in einem Stück schafften sie es das Schiff aus der Höhle zu manövrieren und entkamen dem Untier. 
Dave, überglücklich darüber das er seine Crew wieder hatte rief:"Kurs setzten Männer wir haben eine Fracht auszuliefern!"

`,
      },
      {
        id: "treasure-de-06",
        title: "Kapitel 6 - Eine Krabbische Begegnung",
        language: "Deutsch",
        text: `

Nachdem Dave und seiner Crew die Flucht gelungen ist machen diese sich auf den Weg zu ihrem Ziel.
Das Schiff schaukelt gemächlich über das Meer links und rechts nichts weiter als die ruhige See. 
Dave sitzt in seiner Kajüte und macht sich Gedanken seit sie sich auf den Weg gemacht haben sind sie schon vielen gefahren begegnet, ob das etwas mit der mysteriösen Fracht zu tun hat? Dave weiß nicht mehr weiter.
Oben im Krähennest beobachtet Finian die Azurblaue See, es ist außer ein paar Tung Tung Talahons nichts zu sehen, bei diesen handelt es sich um einen Art Seevogel dessen Federn der Struktur eines Stückes Holz täuschend ähnlich sieht. Sie sind nicht gefährlich aber klauen den Seeleuten oft ihr Essen. 
Alles ist ruhig und die Crew hat nach diesem anstrengenden Teil der Fahrt endlich Zeit für eine Verschnaufpause. 
Als Dave allerdings das Deck betritt ertönt ein markerschütternder Schrei: Nicht noch so ein Vieh denkt sich Dave, und greift zu seinem Säbel. 
Er eilt ins untere Deck den von dort kam der Schrei. Als er dort ankommt lacht er sich kaputt eine Krabe hat sich in das Hinterteil von einem der Seeleute verzwickt.
"Macht das Vieh weg! Macht das Vieh weg", schrie der gezwickte Seemann bei dem es sich um Dr. Janne Noname handelte.
"Selber schuld wenn du dich auf mich drauf setzt!", erwiderte plötzlich die Krabbe, die Crew zuckte erschrocken zurück: "Was ist das für ein Hexenwerk", sagte einer der Seeleute.
"Hexenwerk?! Noch nie eine sprechende Krabbe gesehen was? Ich bin FollowingCrab und ihr seid ziemlich am Arsch."
"Warum den das?" fragte Dave die wunderliche Krabbe.
"Ich hab mich hier mal umgeschaut bevor sich dieser Typ auf mich drauf gesetzt hat und ihr habt da so eine Fracht geladen die ziemlich fragwürdig ist," sagte die Krabbe:" Das was ihr geladen habt ist ein verfluchter Schatz jede Crew die ihn bis jetzt geladen hatte erfur unglaubliches Pech und scheiterte bei dem Versuch die Fracht auszuliefern." 
Auf Daves Gesicht zeichnete sich ein deutliches Lächeln ab: "Noch ein Grund mehr für uns diese Fracht auszuliefern", sagte Dave lächelnd.       

`,
      },
      {
        id: "treasure-de-07",
        title: "Kapitel 7 - ",
        language: "Deutsch",
        text: `



`,
      },
      {
        id: "treasure-de-08",
        title: "Kapitel 8 - ",
        language: "Deutsch",
        text: `
        


`,
      },
      {
        id: "treasure-de-09",
        title: "Kapitel 9",
        language: "Deutsch",
        text: `
Kapitel 9 Inhalt.
`,
      },
      {
        id: "treasure-de-10",
        title: "Kapitel 10",
        language: "Deutsch",
        text: `
Kapitel 10 Inhalt.
`,
      },
      {
        id: "treasure-de-11",
        title: "Kapitel 11",
        language: "Deutsch",
        text: `
Kapitel 11 Inhalt.
`,
      },
      {
        id: "treasure-de-12",
        title: "Kapitel 12",
        language: "Deutsch",
        text: `
Kapitel 12 Inhalt.
`,
      },

      {
        id: "treasure-en-01",
        title: "Chapter 1 - The strange freight",
        language: "English",
        text: `

1540 at a port in a small village called Romna, lies a strongly red painted ship.
It has black ornaments and belongs to the Caiptain boater Dave.
In this day and age, he would be described as a pensioner and a crazy fragile man, but at that time he is an honorable, adventurous and experienced boatman.
His crew also calls him Fliezpiepenheimer.
Today it is a bit strange at the port, as the crew is to ship an important and well-paid cargo for the first time.
The crew scrubs the deck and prepares everything for the arrival of the important load.
After a short time, the expected load arrives and the crew prepares to transport it.
But the Caiptain has a queasy feeling about the matter.
The load is stowed in a massive metal box with 5 locks. "What's in there?" Everyone thinks.
The two men who brought the cargo here clearly warned the crew not to open the box under any circumstances, as this would mean the death of all crew members.
The captain is not so interested in this, but the crew urgently needs the money that is available for the delivery, which is why he has the cargo charged.
The crew has become poor because Ändi, a game-addicted crew member, gambled away the ship's coffers.
The two men quickly disappeared and left behind only an empty port.

`,
      },
      {
        id: "treasure-en-02",
        title: "Chapter 2 - A new adventure",
        language: "English",
        text: `

Loaded with the strange cargo, the ship sets sail and a new adventure begins.
On their journey across the vast seas, the crew faces many challenges.
Finjan Backbeard, the youngest and cheekiest member of the crew, is their most important man despite these extremely strange qualities.
He annoys the captain of the team and does a lot of mischief, but is a master of observation.
On top of his look out, he overlooks the distance, his precise observations often led to the fact that the crew could avoid dangers.
His gaze wanders over the wide sea and the flag of the ship flies in the wind, through it you can recognize Dave's crew from a distance.
This is also thanks to Finjan, because he designed them.
Pictured are a muscular man behind which there is a ship that looks deceptively similar to hers.
Slowly the first day of their journey comes to an end, the crew lies down in their bunks and as the last rays of the sun fade, Dave also goes into his cabin.
For once, the sea is calm and Dave gives the order to lower the anchor.
Lost in thought, he sits in his armchair and thinks about their journey and the strange cargo they have loaded.
But his thoughts are abruptly disturbed by a shock, something must have bumped into the ship.
He grabs his iron saber decorated with gold engravings and steps on the deck of the ship ready for battle.
The rest of the crew has already gathered there and Dave is pushing through the crowd of stinking sailors.
When he arrives at the front end, he sees two sea creatures, so-called "saules" fighting with each other.
These animals are a strange mixture of whale and pig, basically they are peaceful but these are apparently two females.
These are more aggressive than their male conspecifics and defend their territory very weepingly.
However, something is different with these exemplars, but what?
The time to think about it is denied to Dave because Finjan pokes him in the side.
Grinning, he asks him: "Hey Captain, do you already have a certain resemblance to these animals, are they distant relatives of theirs?" Laughing, Dave Finjan's shoulder and replies: "Watch your tongue or you can get to know my alleged relatives right away!".
The crew watches the hustle and bustle of the Sauluppen and then gets back into their bunks.

`,
      },
      {
        id: "treasure-en-03",
        title: "Chapter 3 - An uncertain way",
        language: "English",
        text: `

When Dave wakes up the next morning, everything seems to be fine, the ship rocks quietly in the waves and the first rays of sun shine through the windows of his cabin.
However, when Dave goes out of his cabin onto the deck, his helmsman Dean Silentmouth comes directly to meet him.
Dean has been the helmsman of her ship for many years and one of Dave's closest confidants, there are few who know the world's oceans as well as he does.
Although he doesn't talk much, Dave trusts him completely.
Dean points his finger excitedly at the edge of the ship, he seems almost scared.
This worries Dave but he picks himself up and slowly walks to the edge of the ceiling.
When he arrives there, he is almost speechless, the water has turned into a red fütze, and in it float the remains of one of the saups.
Dave is shaken in his long years as a sailor, he has never seen these animals kill each other and also the wounds on the animal's carcass do not match those that one sale can inflict on another.
However, Dave doesn't have time to think about it anymore, he gives the order to draw the anchor and hoist the sails.
Your journey continues.
Around noon, Finjan reports from the lookout: "Hey Captain over there is a really bad storm... almost as bad as her mood sometimes."
Dave, lost in thought, reaches for the binoculars to take a closer look: "We have to go through that." He says: "Pull in the main sail and cover everything that is not rivet and nail-proof!".
Finjan looks at him with wide eyes: "Well Captain, we'll see each other on the other side... or maybe not."
The storm rages, water splashes up the sides of the deck and the crew staggers over the deck in a daze.
The sky is covered with jet-black clouds that are broken by lightning every minute.
And to make matters worse, fog now also raises, the team almost completely loses their orientation, they can only guess where they are driving, fortunately they have a compass that shows them the way... but where is the compass?
He was just lying next to Dave and Dean on a desk, but now he's gone.
Dave presses across the deck like a wild stallion, desperately searching for the compass.
It takes a while but he finds it... or at least what is left of it, someone must have stepped on the compass in the restlessness of the storm, it lies smashed in its individual parts on the ground.
"How are we supposed to move forward now?" Dave thought to himself.
The storm is still raging, and panic is spreading among the crew.  
They've never been in a situation like this before; without a compass, they're completely disoriented.  
Dave tries to stay calm amidst all the chaos, but even for him, with all his years of experience, it's hard to keep a cool head.  
Through the screaming of the storm, the crew suddenly hears strange noises, loud ones that make their blood freeze.  
A shadow leans over the ship's hull, two glowing red eyes staring into Dave's soul.

`,
      },
      {
        id: "treasure-en-04",
        title: "Chapter 4 - Kidnapping",
        language: "English",
        text: `

Before Dave can even realize it, a huge tentacle grabs him and drags him across the deck. His men desperately try to bring down the monster with muskets and cannons and to free Dave from its tentacles. 
But to everyone's despair, their attacks hardly affect the creature. 
Dave fights back with everything he has; he kicks and strikes the tentacle, but it does no good. The monster dives underwater and moves away from the ship. 
Dave slowly loses consciousness, air becomes scarce, and his vision goes black. When Dave came to, he only had vague memories of what had happened. 
He knew he was no longer on the ship, but he had no idea how long he had been gone. 
Historians still speculate today whether this sudden memory gap was caused by the traumatic experience or simply by Dave's old age. 
In any case, after waking up, Dave found himself in a cave again, but unlike what you would expect, it wasn't dark there; the cave was lit by a bluish glow. 
Dave carefully made his way forward, noticing the outlines of destroyed ships scattered all over the cave. 
Suddenly, he saw movement in the darkness—a large shadow that looked terrifyingly familiar. 
The beast moved through the cave almost as if it were searching for something, but Dave didn't have time to think about that; he had to find an exit.

`,
      },
      {
        id: "treasure-en-05",
        title: "Chapter 5 - Separate Ways",
        language: "English",
        text: `

The crew was shaken. First their compass broke, and now their captain was gone too.  
The mood was at rock bottom, and not even Finian's jokes could lift it again.  
They were all sad, but also determined—none of them wanted to leave Dave behind.  
Dean set course for Deadmansisland, the only place that bastard Dave could be taken to.  
And so Dave's crew set off on a determined rescue mission.  
The wind was good, and the ship glided gleaming through the blue water.  
Everything seemed calm until Finian called out from the lookout: 'Island ahead!'

`,
      },
      {
        id: "treasure-en-06",
        title: "Chapter 6 - One less?",
        language: "English",
        text: `
        
The crew was shaken. First their compass broke, and now their captain was gone too. 
The mood was at rock bottom, and not even Finian’s jokes could cheer them up. 
They were all sad, but also determined; no one wanted to leave Dave behind. 
"Dean set course for Deadman's Island, that’s the only place that damn Dave could be taken to." 
And so, Dave’s crew set off on a rescue mission with determination. The wind was favorable, and the ship slipped gleaming through the blue water. 
Everything seemed calm until Finian called out from the lookout: "Island ahead!"

`,
      },
      {
        id: "treasure-en-07",
        title: "Chapter 7 - The rescue",
        language: "English",
        text: `

Dave kept crawling across the ground, looking for an exit; the strange blue light helped him find his way through the cave. 
Over time, however, he lost track of time; he didn’t know if he had been crawling for hours, days, or weeks. 
His hands felt something in the darkness, something round. As Dave looked more closely at the object, a brief shock of joy ran through him—it was a compass! 
Overjoyed, Dave rolled on the ground... and rolled over a pile of bones. 
The cracking of them was almost impossible to miss in the silence of the cave, and the beast heard it too; it loomed over Dave, its red eyes glowing savagely.  
Boom! A crash echoed through the cave, and one of the rock walls collapsed. 
The sunlight blinded Dave, and only after a few seconds did he see what had come through the wall. 
It was his ship! His crew! They had apparently managed to blast a hole through the wall with the black powder that was still on the ship.
"Finish it off," it shouted from the ship, and Dave heard more explosions. 
The beast had no choice and retreated further into the cave, trying to grab Dave with its tentacles as he ran toward his ship. 
At the last moment, he managed to grab the hands of two of his crew. 
Finian and Julian held on tight and didn’t look like they were going to let go: 'Hold on, Captain, or you’ll be Monster Tatar!' Finian said casually. 
Barely, but in one piece, they managed to maneuver the ship out of the cave and escape the monster. 
Dave, overjoyed to have his crew back, shouted: 'Set course, men! We’ve got cargo to deliver!'

`,
      },
      {
        id: "treasure-en-08",
        title: "Chapter 8 - A Crabby Encounter",
        language: "English",
        text: `

After Dave and his crew managed to escape, they set off towards their destination.  
The ship gently rocks over the sea, nothing to the left or right but the calm water.  
Dave sits in his cabin, lost in thought. Since they set off, they’ve already encountered many dangers—could it have something to do with the mysterious cargo? Dave doesn’t know what to do next.  
Up in the crow’s nest, Finian watches the azure sea. There’s nothing in sight except a few Tung Tung Talahons, a type of seabird whose feathers eerily resemble the texture of a piece of wood. They aren’t dangerous, but they often steal food from the sailors.  
Everything is calm, and after this exhausting part of the journey, the crew finally has time to take a breather.  
But as soon as Dave steps onto the deck, a blood-curdling scream rings out: 'Not another one of those creatures,' Dave thinks, grabbing his saber.  
He rushes to the lower deck—that's where the scream came from. When he gets there, he bursts out laughing: a crab had pinched the backside of one of the sailors. "Get this thing off! Get this thing off!" shouted the pinched sailor, who happened to be Dr. Janne Noname. 
"Serves you right for sitting on me!" replied the crab. The crew recoiled in shock. "What kind of witchcraft is that?" said one of the sailors. "Witchcraft?! Never seen a talking crab before, huh? I'm FollowingCrab, and you guys are pretty screwed." "Why's that?" asked Dave, the peculiar crab.
"I had a look around here before this guy sat on me, and you guys have loaded up some cargo that's pretty shady," said the crab. "What you've loaded is a cursed treasure. Every crew that carried it so far has had unbelievable bad luck and failed to deliver the cargo.
A clear smile appeared on Dave's face: 'All the more reason for us to deliver this cargo,' Dave said, smiling.

`,
      },
      {
        id: "treasure-en-09",
        title: "Chapter 9",
        language: "English",
        text: `
Chapter 9 content.
`,
      },
      {
        id: "treasure-en-10",
        title: "Chapter 10",
        language: "English",
        text: `
Chapter 10 content.
`,
      },
      {
        id: "treasure-en-11",
        title: "Chapter 11",
        language: "English",
        text: `
Chapter 11 content.
`,
      },
      {
        id: "treasure-en-12",
        title: "Chapter 12",
        language: "English",
        text: `
Chapter 12 content.
`,
      },
    ],
  },

  /* ======================================================
     LOGBUCH II - DIE VERLORENE ROUTE
     Direkte Fortsetzung: spielt, nachdem die Crew der
     "Flitzpiepen" die mysteriöse Fracht aus Logbuch I
     erfolgreich ausgeliefert hat. Exakt 14 Kapitel, DE + EN,
     respektiert bestehende Charaktere/Fakten (Dave/Fliez-
     piepenheimer, Finjan Backbeard, Dean Silentmouth, Ändi,
     der zerstörte/gefundene Kompass, die rot bemalte "Flitz-
     piepen" mit schwarzen Verzierungen).
  ====================================================== */
  {
    id: "lost-route",
    title: "Das Tagebuch des Schifffahrers",
    cover: "scripts/image/logbook-ii-cover.svg",
    description:
      "Eine uralte Karte, ein grünes Licht, das niemand erklären kann, und eine Insel, die auf keiner Seekarte verzeichnet ist. Schifffahrer Daves eigene Aufzeichnungen von der Suche nach dem legendären Schatz - und von dem, was am Ende wirklich in der Truhe lag.",

    characters: ["dave"],

    chapters: [
      {
        id: "lostroute-de-01",
        title: "Kapitel I - Der Ruf des Meeres",
        language: "Deutsch",
        text: `
Tag 1

Endlich sind wir wieder auf See.

Ich hätte nie gedacht, dass ich diesen Satz noch einmal schreiben würde. Nach allem, was wir erlebt haben, hätte ich eigentlich genug vom Meer haben müssen. Doch kaum hatte ich das vertraute Knarren der Planken unter meinen Füßen gehört, wusste ich, dass ich zurückgehört.

Der Kapitän hat heute Morgen den Befehl gegeben, die Segel zu setzen.

Unser Ziel kennt kaum jemand.

Ich selbst kenne es nicht einmal genau.

Es heißt nur, irgendwo jenseits der bekannten Gewässer soll eine Insel liegen. Eine Insel, die auf keiner gewöhnlichen Karte verzeichnet ist.

Und dort soll etwas verborgen sein.

Ein Schatz.

Nicht irgendein Schatz.

Der legendäre Schatz.

Seit Jahren erzählen sich die Seeleute Geschichten darüber. Gold, Juwelen und Reichtümer sollen dort liegen. Manche behaupten sogar, der Schatz sei älter als die ersten Piratenkarten.

Ich habe immer gedacht, das seien Geschichten für betrunkene Matrosen.

Heute bin ich mir da nicht mehr so sicher.

Denn der Kapitän besitzt eine Karte.

Und sie sieht verdammt echt aus.
`,
      },
      {
        id: "lostroute-de-02",
        title: "Kapitel II - Die Karte",
        language: "Deutsch",
        text: `
Tag 3

Ich durfte die Karte heute zum ersten Mal aus der Nähe sehen.

Sie ist alt. Sehr alt.

Das Papier ist an den Rändern verbrannt und an mehreren Stellen eingerissen. Seltsame Symbole bedecken die Oberfläche. Einige davon konnte nicht einmal unser Navigator entziffern.

In der Mitte befindet sich ein Zeichen, das wie ein Auge aussieht.

Darunter steht ein Satz:

„Wer den Schatz sucht, muss zuerst das Meer verstehen."

Was soll das bedeuten?

Der Kapitän wollte meine Frage nicht beantworten.

Stattdessen sagte er nur:

„Dave, manche Karten zeigen nicht, wohin man fahren muss. Sie zeigen, wann man fahren muss."

Seitdem denke ich darüber nach.

Heute Nacht habe ich die Karte noch einmal heimlich angesehen.

Das Auge auf der Karte schien im Mondlicht zu glänzen.

Vielleicht bilde ich mir das nur ein.

Ich hoffe es.
`,
      },
      {
        id: "lostroute-de-03",
        title: "Kapitel III - Das seltsame Licht",
        language: "Deutsch",
        text: `
Tag 6

Etwas stimmt mit dem Meer nicht.

Seit heute Morgen ist kein einziger Vogel mehr zu sehen.

Kein Fisch.

Nicht einmal eine Möwe.

Das Wasser ist vollkommen ruhig.

Zu ruhig.

Gegen Mittag meldete der Ausguck ein Licht am Horizont. Zuerst dachten wir, es wäre ein Schiff. Doch das Licht bewegte sich nicht.

Es war grün.

Der Kapitän ließ den Kurs ändern.

Ich fragte ihn, warum.

Er antwortete:

„Weil das Licht uns bereits gefunden hat."

Diese Antwort gefiel mir überhaupt nicht.

Kurz vor Sonnenuntergang verschwand das Licht.

Doch auf dem Wasser blieb etwas zurück.

Eine Reihe kleiner, leuchtender Punkte.

Sie führte direkt nach Westen.

Der Kapitän befahl, ihnen zu folgen.

Niemand widersprach.

Ich auch nicht.

Aber ich habe heute zum ersten Mal Angst.
`,
      },
      {
        id: "lostroute-de-04",
        title: "Kapitel IV - Der Sturm",
        language: "Deutsch",
        text: `
Tag 7

Der Sturm kam ohne Vorwarnung.

Vor wenigen Minuten war der Himmel noch klar gewesen. Dann wurde es dunkel.

Nicht einfach bewölkt.

Dunkel.

Als hätte jemand den Himmel mit schwarzer Tinte übergossen.

Der Wind riss an den Segeln. Wellen schlugen über das Deck. Zwei Männer mussten die Taue sichern, während der Rest versuchte, das Schiff auf Kurs zu halten.

Dann hörte ich es.

Ein Geräusch unter uns.

Ein tiefes Dröhnen.

Als würde etwas Riesiges unter dem Schiff schwimmen.

Wir haben nichts gesehen.

Aber ich bin mir sicher, dass dort etwas war.

Kurz darauf erschien wieder das grüne Licht.

Diesmal direkt vor unserem Bug.

Der Kapitän schrie:

„Nicht ausweichen!"

Wir fuhren mitten hinein.

Für einen Augenblick war alles still.

Dann wurde die Welt weiß.
`,
      },
      {
        id: "lostroute-de-05",
        title: "Kapitel V - Die Insel",
        language: "Deutsch",
        text: `
Tag 8

Wir haben überlebt.

Ich weiß nicht wie.

Das Schiff ist beschädigt, aber noch schwimmfähig. Einige Vorräte sind verloren gegangen. Einer unserer Männer wurde verletzt.

Doch das Merkwürdigste ist:

Wir sind nicht mehr dort, wo wir sein sollten.

Vor uns liegt eine Insel.

Eine gewaltige Insel.

Hohe schwarze Klippen ragen aus dem Wasser. Dahinter beginnt ein dichter Wald.

Auf keiner Karte befindet sich diese Insel.

Der Kapitän hat die alte Schatzkarte neben den Horizont gehalten.

Sie passt.

Das Symbol in der Mitte der Karte zeigt genau auf diese Insel.

Wir haben sie gefunden.

Oder vielleicht hat sie uns gefunden.

Am Strand entdeckten wir Fußspuren.

Sie waren frisch.

Und sie waren nicht von uns.
`,
      },
      {
        id: "lostroute-de-06",
        title: "Kapitel VI - Die Ruinen",
        language: "Deutsch",
        text: `
Tag 9

Wir sind ins Landesinnere vorgedrungen.

Nach ungefähr einer Stunde fanden wir die ersten Ruinen.

Steinerne Mauern, überwuchert von Pflanzen. Säulen, die halb im Boden versunken waren. An einigen Stellen waren Symbole in den Stein gemeißelt.

Eines davon kenne ich.

Das Auge.

Das gleiche Zeichen wie auf unserer Karte.

Wir fanden außerdem eine alte Steintafel.

Darauf steht:

„Der Schatz gehört nicht dem, der ihn findet. Er gehört dem, der würdig ist."

Unser Kapitän wollte sofort weiter.

Ich fragte ihn, was „würdig" bedeuten soll.

Er sagte:

„Das werden wir herausfinden."

Ich glaube, er weiß mehr, als er uns erzählt.

Sehr viel mehr.
`,
      },
      {
        id: "lostroute-de-07",
        title: "Kapitel VII - Der Wächter",
        language: "Deutsch",
        text: `
Tag 10

Heute haben wir den Eingang gefunden.

Eine riesige Steintür mitten im Felsen.

Davor standen zwei Statuen.

Piraten.

Zumindest sahen sie so aus.

Zwischen ihnen befand sich ein Sockel mit einer Vertiefung.

Unsere Karte passte hinein.

Als der Kapitän sie einlegte, begann der Boden zu zittern.

Die Augen der Statuen leuchteten auf.

Dann öffnete sich die Tür.

Hinter ihr lag ein dunkler Tunnel.

Wir gingen hinein.

Nach ungefähr zehn Minuten hörten wir ein Geräusch.

Ein Knurren.

Etwas bewegte sich im Dunkeln.

Wir zogen unsere Waffen.

Dann erschien eine Gestalt.

Kein Mensch.

Kein Tier.

Ein Wächter aus Stein und Metall.

Er stellte uns nur eine Frage:

„Warum wollt ihr den Schatz?"

Niemand antwortete.

Dann sah er mich an.

Ich weiß bis heute nicht warum.
`,
      },
      {
        id: "lostroute-de-08",
        title: "Kapitel VIII - Die Prüfung",
        language: "Deutsch",
        text: `
Tag 11

Der Wächter ließ uns passieren.

Aber nur, nachdem wir eine Prüfung bestanden hatten.

Wir mussten drei Türen öffnen.

Hinter jeder Tür befand sich ein Symbol.

Gold.

Krone.

Herz.

Die meisten von uns wollten natürlich die Tür mit dem Gold öffnen.

Sie war eine Falle.

Hinter ihr befand sich eine tiefe Grube.

Die Krone führte zu einem weiteren verschlossenen Raum.

Das Herz war die richtige Wahl.

Dahinter lag kein Gold.

Nur ein kleiner, alter Kompass.

Auf seiner Rückseite stand:

„Nicht jeder Schatz glänzt."

Der Kapitän nahm ihn an sich.

Ich glaube, er war enttäuscht.

Ich dagegen hatte plötzlich das Gefühl, dass wir langsam verstehen, worum es hier wirklich geht.

Vielleicht ist der Schatz nicht das, was wir erwarten.
`,
      },
      {
        id: "lostroute-de-09",
        title: "Kapitel IX - Die Kammer",
        language: "Deutsch",
        text: `
Tag 12

Wir haben die Schatzkammer erreicht.

Ich finde kaum Worte dafür.

Der Raum ist riesig.

An den Wänden hängen goldene Schilde. Überall stehen Truhen. Juwelen liegen auf dem Boden. Münzen stapeln sich bis zu den Wänden.

Wir hatten den legendären Schatz gefunden.

Oder zumindest glaubten wir das.

Denn in der Mitte des Raumes stand eine einzige schwarze Truhe.

Sie war kleiner als alle anderen.

Und sie war verschlossen.

Der Kapitän öffnete sie nicht.

Er sagte:

„Das ist der eigentliche Schatz."

Ich fragte ihn, woher er das wisse.

Er zeigte auf die Karte.

Das Auge war verschwunden.

An seiner Stelle stand nun ein neuer Satz:

„Du hast gefunden, wonach du gesucht hast. Jetzt entscheide, was du damit machst."
`,
      },
      {
        id: "lostroute-de-10",
        title: "Kapitel X - Verrat",
        language: "Deutsch",
        text: `
Tag 13

Wir sind nicht allein auf der Insel.

Heute Morgen entdeckten wir ein Schiff in der Bucht.

Eine fremde Crew.

Sie müssen uns verfolgt haben.

Sie wissen vom Schatz.

Und sie wollen ihn.

Kurz nach Sonnenuntergang wurden wir angegriffen.

Wir konnten uns zunächst verteidigen, doch dann geschah etwas, womit niemand gerechnet hatte.

Einer unserer Männer öffnete die Tür zur Schatzkammer.

Er hatte uns verraten.

Die fremde Crew stürmte hinein.

Plötzlich ging alles sehr schnell.

Schüsse.

Geschrei.

Rauch.

Die schwarze Truhe wurde gestohlen.

Ich rannte hinter ihnen her.

Bis zum Strand.

Doch ich war zu spät.

Das fremde Schiff setzte die Segel.

Der Kapitän stand neben mir und sah hinaus.

Er sagte kein Wort.

Dann bemerkte ich etwas.

Die Truhe war gar nicht mehr auf dem Schiff.
`,
      },
      {
        id: "lostroute-de-11",
        title: "Kapitel XI - Was wirklich in der Truhe war",
        language: "Deutsch",
        text: `
Tag 14

Wir haben die Truhe gefunden.

Sie lag dort, wo wir sie am wenigsten erwartet hatten.

In unserem eigenen Schiff.

Der Wächter hatte sie nicht beschützt.

Er hatte sie bewegt.

Warum?

Wir öffneten sie.

Darin lag kein Gold.

Keine Juwelen.

Kein Schatz.

Nur ein altes Buch.

Die erste Seite enthielt einen Namen.

Dave.

Mein Name.

Ich konnte nichts sagen.

Der Kapitän wusste offenbar davon.

Das Buch erzählt von den früheren Reisen unserer Crew.

Von Dingen, die nie jemand aufgeschrieben hat.

Von Schiffen, die verschwanden.

Von Inseln, die auf keiner Karte stehen.

Und ganz am Ende fand ich eine Zeichnung.

Ein Helm.

Ein Feuer.

Und darunter ein Satz:

„Die nächste Reise beginnt, wenn der Horizont brennt."

Ich habe das Gefühl, dass dies erst der Anfang ist.
`,
      },
      {
        id: "lostroute-de-12",
        title: "Kapitel XII - Der letzte Eintrag",
        language: "Deutsch",
        text: `
Tag 15

Wir verlassen die Insel.

Der Schatz bleibt zurück.

Zumindest der Teil, den wir gefunden haben.

Wir nehmen nur das Buch und den Kompass mit.

Vielleicht war genau das die Prüfung.

Nicht zu nehmen, was man nehmen kann.

Sondern zu verstehen, was man gefunden hat.

Die Insel verschwindet bereits im Nebel.

Ich habe noch einmal zurückgeblickt.

Für einen kurzen Moment sah ich das grüne Licht.

Dann war es verschwunden.

Der Kapitän hat mir heute gesagt, dass wir nicht nach Hause fahren.

Noch nicht.

Er hat einen neuen Kurs gesetzt.

Nordwest.

Ich fragte ihn, wohin wir fahren.

Er antwortete:

„Dorthin, wo das Buch uns hinführt."

Ich habe die letzte Seite aufgeschlagen.

Dort steht nur ein einziger Satz.

„Dave, wenn du dies liest, hast du den ersten Schatz gefunden. Der zweite wartet bereits."

Ich habe das Buch geschlossen.

Der Wind nimmt zu.

Die Segel sind gesetzt.

Und irgendwo vor uns beginnt der nächste Horizont.

– Ende des zweiten Logbuchs –
`,
      },
      {
        id: "lostroute-en-01",
        title: "Chapter I - The Call of the Sea",
        language: "English",
        text: `
Day 1

We're finally at sea again.

I never thought I'd write that sentence again. After everything we've been through, I should have had enough of the sea. But the moment I heard the familiar creak of the planks beneath my feet, I knew I had come back.

The captain gave the order this morning to set sail.

Hardly anyone knows our destination.

I don't even know it myself, not exactly.

They say there's an island somewhere beyond the known waters. An island marked on no ordinary map.

And something is said to be hidden there.

A treasure.

Not just any treasure.

The legendary treasure.

For years, sailors have told stories about it. Gold, jewels, and riches are said to lie there. Some even claim the treasure is older than the first pirate maps.

I always thought those were stories for drunken sailors.

Today, I'm not so sure anymore.

Because the captain has a map.

And it looks damn real.
`,
      },
      {
        id: "lostroute-en-02",
        title: "Chapter II - The Map",
        language: "English",
        text: `
Day 3

I got to see the map up close for the first time today.

It's old. Very old.

The paper is burned at the edges and torn in several places. Strange symbols cover its surface. Even our navigator couldn't decipher some of them.

In the middle is a mark that looks like an eye.

Beneath it is a sentence:

"Whoever seeks the treasure must first understand the sea."

What is that supposed to mean?

The captain didn't want to answer my question.

Instead, he just said:

"Dave, some maps don't show you where you have to go. They show you when you have to go."

I've been thinking about it ever since.

Tonight I looked at the map again in secret.

The eye on the map seemed to shimmer in the moonlight.

Maybe I'm just imagining it.

I hope so.
`,
      },
      {
        id: "lostroute-en-03",
        title: "Chapter III - The Strange Light",
        language: "English",
        text: `
Day 6

Something is wrong with the sea.

Since this morning, not a single bird has been in sight.

No fish.

Not even a gull.

The water is perfectly still.

Too still.

Around midday the lookout reported a light on the horizon. At first we thought it was a ship. But the light wasn't moving.

It was green.

The captain had the course changed.

I asked him why.

He answered:

"Because the light has already found us."

I didn't like that answer at all.

Shortly before sunset the light disappeared.

But something remained on the water.

A trail of small, glowing dots.

It led straight west.

The captain ordered us to follow it.

No one objected.

Neither did I.

But today, for the first time, I'm afraid.
`,
      },
      {
        id: "lostroute-en-04",
        title: "Chapter IV - The Storm",
        language: "English",
        text: `
Day 7

The storm came without warning.

Just minutes ago the sky had still been clear. Then it turned dark.

Not just overcast.

Dark.

As if someone had poured black ink over the sky.

The wind tore at the sails. Waves crashed over the deck. Two men had to secure the ropes while the rest tried to keep the ship on course.

Then I heard it.

A sound beneath us.

A deep rumble.

As if something enormous were swimming under the ship.

We saw nothing.

But I'm certain something was there.

Shortly after, the green light appeared again.

This time right in front of our bow.

The captain shouted:

"Don't turn away!"

We sailed straight into it.

For a moment everything was still.

Then the world turned white.
`,
      },
      {
        id: "lostroute-en-05",
        title: "Chapter V - The Island",
        language: "English",
        text: `
Day 8

We survived.

I don't know how.

The ship is damaged but still afloat. Some supplies were lost. One of our men was injured.

But the strangest thing is:

We're no longer where we should be.

An island lies before us.

A massive island.

Tall black cliffs rise out of the water. Beyond them begins a dense forest.

This island is on no map.

The captain held the old treasure map up against the horizon.

It matches.

The symbol at the center of the map points exactly at this island.

We found it.

Or maybe it found us.

On the beach we found footprints.

They were fresh.

And they weren't ours.
`,
      },
      {
        id: "lostroute-en-06",
        title: "Chapter VI - The Ruins",
        language: "English",
        text: `
Day 9

We pushed inland.

After about an hour we found the first ruins.

Stone walls, overgrown with plants. Columns half-sunk into the ground. Symbols were carved into the stone in several places.

I recognize one of them.

The eye.

The same mark as on our map.

We also found an old stone tablet.

It reads:

"The treasure does not belong to the one who finds it. It belongs to the one who is worthy."

Our captain wanted to press on immediately.

I asked him what "worthy" was supposed to mean.

He said:

"We'll find out."

I think he knows more than he's telling us.

Much more.
`,
      },
      {
        id: "lostroute-en-07",
        title: "Chapter VII - The Guardian",
        language: "English",
        text: `
Day 10

Today we found the entrance.

A massive stone door set into the rock.

Two statues stood before it.

Pirates.

At least, that's what they looked like.

Between them was a pedestal with a hollow.

Our map fit right in.

When the captain placed it there, the ground began to shake.

The statues' eyes lit up.

Then the door opened.

Behind it lay a dark tunnel.

We went inside.

After about ten minutes we heard a sound.

A growl.

Something was moving in the dark.

We drew our weapons.

Then a figure appeared.

Not human.

Not animal.

A guardian made of stone and metal.

It asked us only one question:

"Why do you seek the treasure?"

No one answered.

Then it looked at me.

To this day I don't know why.
`,
      },
      {
        id: "lostroute-en-08",
        title: "Chapter VIII - The Trial",
        language: "English",
        text: `
Day 11

The guardian let us pass.

But only after we had passed a trial.

We had to open three doors.

Behind each door was a symbol.

Gold.

Crown.

Heart.

Most of us naturally wanted to open the door with the gold.

It was a trap.

Behind it was a deep pit.

The crown led to another locked room.

The heart was the right choice.

Behind it lay no gold.

Only a small, old compass.

On its back it read:

"Not every treasure glitters."

The captain took it for himself.

I think he was disappointed.

I, on the other hand, suddenly had the feeling that we were slowly starting to understand what this is really about.

Maybe the treasure isn't what we expect.
`,
      },
      {
        id: "lostroute-en-09",
        title: "Chapter IX - The Chamber",
        language: "English",
        text: `
Day 12

We reached the treasure chamber.

I can barely find words for it.

The room is enormous.

Golden shields hang on the walls. Chests stand everywhere. Jewels lie on the floor. Coins are piled up to the walls.

We had found the legendary treasure.

Or at least, that's what we believed.

Because in the middle of the room stood a single black chest.

It was smaller than all the others.

And it was locked.

The captain didn't open it.

He said:

"That's the real treasure."

I asked him how he knew that.

He pointed at the map.

The eye was gone.

In its place was now a new sentence:

"You have found what you were looking for. Now decide what you do with it."
`,
      },
      {
        id: "lostroute-en-10",
        title: "Chapter X - Betrayal",
        language: "English",
        text: `
Day 13

We're not alone on the island.

This morning we spotted a ship in the bay.

A foreign crew.

They must have followed us.

They know about the treasure.

And they want it.

Shortly after sunset we were attacked.

At first we managed to defend ourselves, but then something happened that no one had expected.

One of our own men opened the door to the treasure chamber.

He had betrayed us.

The foreign crew stormed in.

Suddenly everything happened very fast.

Shots.

Screaming.

Smoke.

The black chest was stolen.

I ran after them.

All the way to the beach.

But I was too late.

The foreign ship set sail.

The captain stood beside me and looked out.

He didn't say a word.

Then I noticed something.

The chest was no longer on the ship at all.
`,
      },
      {
        id: "lostroute-en-11",
        title: "Chapter XI - What Was Really in the Chest",
        language: "English",
        text: `
Day 14

We found the chest.

It was lying exactly where we'd least expected it.

On our own ship.

The guardian hadn't been protecting it.

It had been moving it.

Why?

We opened it.

Inside lay no gold.

No jewels.

No treasure.

Only an old book.

The first page held a name.

Dave.

My name.

I couldn't say anything.

The captain apparently already knew.

The book tells of our crew's earlier voyages.

Of things no one ever wrote down.

Of ships that vanished.

Of islands that appear on no map.

And right at the end I found a drawing.

A helmet.

A fire.

And beneath it a sentence:

"The next voyage begins when the horizon burns."

I have the feeling this is only the beginning.
`,
      },
      {
        id: "lostroute-en-12",
        title: "Chapter XII - The Last Entry",
        language: "English",
        text: `
Day 15

We're leaving the island.

The treasure stays behind.

At least the part we found.

We're only taking the book and the compass with us.

Maybe that was exactly the trial.

Not to take what you can take.

But to understand what you have found.

The island is already vanishing into the fog.

I looked back one more time.

For a brief moment I saw the green light.

Then it was gone.

The captain told me today that we're not sailing home.

Not yet.

He's set a new course.

Northwest.

I asked him where we're going.

He answered:

"Wherever the book leads us."

I opened the last page.

There's only a single sentence written there.

"Dave, if you're reading this, you've found the first treasure. The second is already waiting."

I closed the book.

The wind is picking up.

The sails are set.

And somewhere ahead of us, the next horizon begins.

– End of the second logbook –
`,
      },
    ],
  },
];
