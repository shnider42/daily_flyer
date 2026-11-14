"""Small, hand-authored party packs. Answers stay on the server."""
TOPICS = {"music": "Music", "screen": "Film & TV", "games": "Games", "sports": "Sports", "food": "Food", "wild": "Wildcard"}
# question, four choices, correct index, explanation
PACKS = {
"music": [
("Which band released The Dark Side of the Moon?", ["Pink Floyd", "Led Zeppelin", "The Doors", "Queen"], 0, "Pink Floyd released it in 1973. Headphones optional; good speakers encouraged."),
("On a standard six-string guitar, how many strings are usually tuned to E?", ["One", "Two", "Three", "Four"], 1, "Standard tuning is E–A–D–G–B–E, from lowest to highest."),
("Which instrument does a drummer usually play with a foot pedal?", ["Snare drum", "Floor tom", "Bass drum", "Ride cymbal"], 2, "The bass drum is also called the kick drum."),
("Which group gave us Dancing Queen?", ["Bee Gees", "Blondie", "Fleetwood Mac", "ABBA"], 3, "ABBA released Dancing Queen in 1976."),
("A duet is written for how many performers?", ["Two", "Three", "Four", "Five"], 0, "Two. A trio adds a third; a quartet makes four."),
],
"screen": [
("In Back to the Future, the time machine is built from what car?", ["Ferrari", "DeLorean", "Mustang", "Corvette"], 1, "Doc Brown's DeLorean needs to reach 88 miles per hour."),
("Which film features a toy cowboy named Woody?", ["Shrek", "Cars", "Toy Story", "Monsters, Inc."], 2, "Woody is the pull-string cowboy in Toy Story."),
("What is the name of the paper company in the US version of The Office?", ["Initech", "Waystar Royco", "Sterling Cooper", "Dunder Mifflin"], 3, "Dunder Mifflin. The show mainly follows its Scranton branch."),
("Which film sends a young hobbit named Frodo on a journey to destroy a ring?", ["The Fellowship of the Ring", "The Lion King", "Willow", "The NeverEnding Story"], 0, "The Fellowship of the Ring begins Frodo's journey in the film trilogy."),
("What kind of animal is Remy in Ratatouille?", ["Mouse", "Rat", "Rabbit", "Hamster"], 1, "A rat with an exceptional sense of taste and smell."),
],
"games": [
("In chess, which piece moves in an L shape?", ["Bishop", "Rook", "Knight", "Queen"], 2, "The knight moves two squares along one axis and one along the other, jumping over pieces."),
("Which Minecraft material do you mine to make a Nether portal frame?", ["Quartz", "Emerald", "Sandstone", "Obsidian"], 3, "An obsidian frame is lit to activate the portal."),
("In standard Monopoly, how much do you collect when you pass GO?", ["$200", "$100", "$500", "$50"], 0, "$200. House rules have started arguments over considerably less."),
("Which Nintendo character is usually trying to rescue Princess Peach?", ["Link", "Mario", "Kirby", "Samus"], 1, "Mario. Link is the hero of The Legend of Zelda."),
("In a standard deck of playing cards, how many suits are there?", ["Two", "Three", "Four", "Five"], 2, "Clubs, diamonds, hearts, and spades."),
],
"sports": [
("How many points is an American football touchdown worth before the extra try?", ["Three", "Seven", "Two", "Six"], 3, "Six. A kick can add one; a successful two-point conversion adds two."),
("In soccer, how many players does each team start with on the field?", ["Eleven", "Nine", "Ten", "Twelve"], 0, "Eleven, including the goalkeeper."),
("In baseball, how many outs end a team's half-inning?", ["Two", "Three", "Four", "Six"], 1, "Three outs, then the teams switch between batting and fielding."),
("In tennis, what does love mean on the scoreboard?", ["A tie", "Match point", "Zero", "An advantage"], 2, "Love means zero points."),
("Which sport uses a puck?", ["Volleyball", "Cricket", "Lacrosse", "Ice hockey"], 3, "Ice hockey uses a rubber puck."),
],
"food": [
("What is the main ingredient in traditional guacamole?", ["Avocado", "Peas", "Zucchini", "Spinach"], 0, "Avocado, often with lime, salt, onion, and other additions."),
("What gives a classic pesto its green color?", ["Parsley", "Basil", "Mint", "Lettuce"], 1, "Basil is the defining herb in pesto alla genovese."),
("Which of these is made by fermenting cabbage?", ["Hummus", "Couscous", "Sauerkraut", "Polenta"], 2, "Sauerkraut is fermented cabbage."),
("What is tofu primarily made from?", ["Rice", "Chickpeas", "Milk", "Soybeans"], 3, "Tofu is made by coagulating soy milk and pressing the curds."),
("Which ingredient makes bread dough rise in a typical yeast loaf?", ["Yeast", "Salt", "Olive oil", "Vinegar"], 0, "Yeast releases carbon dioxide during fermentation."),
],
"wild": [
("How many sides does a hexagon have?", ["Five", "Six", "Seven", "Eight"], 1, "Six sides. Hexagons turn up in honeycombs and a suspicious number of DFE games."),
("Which planet is known as the Red Planet?", ["Venus", "Jupiter", "Mars", "Neptune"], 2, "Mars gets its reddish appearance from iron oxide on its surface."),
("Which of these mammals lays eggs?", ["Dolphin", "Bat", "Koala", "Platypus"], 3, "The platypus is a monotreme, an egg-laying mammal."),
("How many minutes are in a day?", ["1,440", "1,200", "1,600", "2,400"], 0, "24 × 60 = 1,440 minutes."),
("What is the chemical symbol for gold?", ["Ag", "Au", "Gd", "Go"], 1, "Au comes from the Latin aurum. Ag is silver."),
]}
POLLS = [
("The only acceptable last song of the night?", ["A huge singalong", "One last dance", "Something sentimental", "The host gets the last word"]),
("The aux cord lands in your lap. You play…", ["An old favorite", "Something nobody knows", "A guaranteed floor-filler", "An extremely risky choice"]),
("Settle it: the best party food is…", ["Pizza", "Chips & dip", "Wings", "Whatever's in the oven"]),
("Pick your side quest.", ["Kitchen conversation", "Dance floor", "A competitive game", "Meeting the pet"]),
("A film everybody loves but you don't: do you admit it?", ["Immediately", "Only if asked", "After a full presentation", "I take it to my grave"]),
("Your ideal next hangout?", ["Live music", "Game night", "A day outside", "Absolutely no plan"]),
]
PROMPTS = ["A song you will defend in any room.", "The song that makes you turn it up in the car.", "Something nobody here has heard yet.", "A song that belongs in a movie's final scene.", "The most unexpected song you know every word to.", "One song to win over the whole room."]
