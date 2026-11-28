/**
 * Pocket College Hoops catalogue.
 * Schools and home venues are real; every player, rating and playstyle below is
 * original arcade fiction, not a current roster or an assessment of a real team.
 * height = inches; tempo = dimensionless CPU pace multiplier. No runtime fetches.
 */
export const ROSTER_NOTE = "Real college programs. Original fictional players and arcade ratings.";

export const OFFENSE = [
  { id: "pickroll", name: "High pick & roll", tag: "TWO-MAN GAME", description: "Your center sets a high screen, then rolls toward the rim. Wings keep the corners open.", hint: "Turn the corner. Pass to the roller when the help defender steps up." },
  { id: "motion", name: "Motion offense", tag: "CUT & REPLACE", description: "Wings exchange sides, the weak-side player cuts, and the big relocates to open a passing lane.", hint: "Move the ball and watch for a cutter behind the defense." },
  { id: "spacing", name: "Drive & kick", tag: "FOUR OUT", description: "Four players spread the floor while the center stays near the rim for a finish or rebound.", hint: "Drive into a gap, draw help, then pass to the open shooter." },
  { id: "post", name: "Post up", tag: "INSIDE OUT", description: "Your big establishes position near the block. Teammates clear the lane and offer outlets.", hint: "Feed the post. Finish inside or pass out when a second defender arrives." },
];

export const DEFENSE = [
  { id: "man", name: "Man to man", tag: "STAY CONNECTED", description: "Each defender tracks an opponent, with help near the basket.", hint: "Stay between your assignment and the rim. Switch to the closest defender when beaten." },
  { id: "zone", name: "2–3 zone", tag: "PROTECT THE PAINT", description: "Two defenders guard the perimeter; three protect the lane and baseline.", hint: "Close out on shooters without pulling everyone away from the paint." },
  { id: "press", name: "Full-court press", tag: "TURN UP THE HEAT", description: "Defenders apply pressure earlier and pursue passing lanes, at the cost of stamina and space behind them.", hint: "Trap near the sideline. Recover quickly if the first pass beats the press." },
];

const definitions = [
  {
    id: "uconn", name: "UConn", short: "UCONN", mascot: "Huskies", city: "Storrs, CT",
    primary: "#000e2f", secondary: "#e4002b", arena: "Gampel Pavilion",
    style: "SCREEN. CUT. FINISH.", description: "A balanced unit built around connected movement, sturdy screens, and reliable paint defense.",
    offense: "pickroll", defense: "man", tempo: 1.03, ratings: [85, 80, 84, 86, 84],
    names: ["Malik Ashford", "Evan Rosales", "Darius Keene", "Noah Vukovic", "Isaiah Mercer", "Julian Park", "Tobias Grant", "Andre Baptiste"],
    source: "https://uconnhuskies.com/sports/2018/6/12/facilities-gampel-pavilion-html?path=sad",
  },
  {
    id: "duke", name: "Duke", short: "DUKE", mascot: "Blue Devils", city: "Durham, NC",
    primary: "#003087", secondary: "#ffffff", arena: "Cameron Indoor Stadium",
    style: "MAKE THE EXTRA PASS.", description: "Dangerous perimeter shooting and skilled guards reward patient passes and clean spacing.",
    offense: "spacing", defense: "man", tempo: 1.04, ratings: [90, 84, 78, 83, 77],
    names: ["Cameron Ellis", "Trey Hollis", "Adrian Vale", "Marcus Weller", "Luka Petrovic", "Devon Price", "Owen Castillo", "Samuel Okoro"],
    source: "https://goduke.com/facilities/cameron-indoor-stadium/11",
  },
  {
    id: "unc", name: "North Carolina", short: "UNC", mascot: "Tar Heels", city: "Chapel Hill, NC",
    primary: "#7bafd4", secondary: "#13294b", arena: "Dean E. Smith Center",
    style: "REBOUND. RUN. REPEAT.", description: "Fast guards and strong rebounders turn defensive stops into early attacks at the other end.",
    offense: "motion", defense: "man", tempo: 1.16, ratings: [79, 91, 83, 76, 87],
    names: ["Jalen Whitaker", "Eli Jefferson", "Desmond Hale", "Caleb Boone", "Micah Stone", "Felix Navarro", "Rashad Benton", "Jonas Adeyemi"],
    source: "https://goheels.com/facilities/smith-center/136",
  },
  {
    id: "kansas", name: "Kansas", short: "KU", mascot: "Jayhawks", city: "Lawrence, KS",
    primary: "#0051ba", secondary: "#e8000d", arena: "Allen Fieldhouse",
    style: "WORK THROUGH THE BIGS.", description: "Versatile big men, dependable passing, and balanced defense give the high-low game room to work.",
    offense: "post", defense: "man", tempo: 1.00, ratings: [82, 82, 87, 82, 83],
    names: ["Tyrese Langford", "Milo Ramsey", "Jordan Salazar", "Bennett Cole", "Kofi Mensah", "Ashton Reid", "Dante Wallace", "Emil Novak"],
    source: "https://kuathletics.com/facilities/allen-fieldhouse/188",
  },
  {
    id: "kentucky", name: "Kentucky", short: "UK", mascot: "Wildcats", city: "Lexington, KY",
    primary: "#0033a0", secondary: "#ffffff", arena: "Rupp Arena",
    style: "ATTACK ABOVE THE RIM.", description: "Explosive runners and strong finishers thrive on drives, rolls, and quick transition chances.",
    offense: "pickroll", defense: "press", tempo: 1.13, ratings: [75, 92, 89, 84, 77],
    names: ["Damon Raines", "Isaac Bellamy", "Quentin Archer", "Zion Caldwell", "Malcolm Rivers", "Nico Santos", "Terrence Knox", "Hugo Diallo"],
    source: "https://ukathletics.com/facilities/rupp-arena/",
  },
  {
    id: "ucla", name: "UCLA", short: "UCLA", mascot: "Bruins", city: "Los Angeles, CA",
    primary: "#2d68c4", secondary: "#f2a900", arena: "Pauley Pavilion",
    style: "FIVE PLAYERS. ONE RHYTHM.", description: "Disciplined movement and well-rounded defenders create a steady half-court game.",
    offense: "motion", defense: "man", tempo: 0.95, ratings: [85, 80, 82, 86, 80],
    names: ["Miles Serrano", "Kenji Brooks", "Avery Winston", "Dominic Cruz", "Aaron Nwosu", "Seth Lin", "Jabari Tate", "Matteo Silva"],
    source: "https://uclabruins.com/news/2026/09/16/mens-basketball-announces-2026-27-schedule",
  },
  {
    id: "indiana", name: "Indiana", short: "IU", mascot: "Hoosiers", city: "Bloomington, IN",
    primary: "#990000", secondary: "#eeedeb", arena: "Assembly Hall",
    style: "CUT WITH A PURPOSE.", description: "Patient cutters, good shooting, and tight defensive assignments reward a measured approach.",
    offense: "motion", defense: "man", tempo: 0.90, ratings: [85, 75, 84, 88, 81],
    names: ["Wyatt Henson", "DeAndre Sutton", "Leo Marshall", "Trevor Garrison", "Solomon Price", "Reece Holloway", "Mateo Vega", "Ellis Booker"],
    source: "https://iuhoosiers.com/facilities/detail/2",
  },
  {
    id: "michigan", name: "Michigan", short: "MICH", mascot: "Wolverines", city: "Ann Arbor, MI",
    primary: "#00274c", secondary: "#ffcb05", arena: "Crisler Center",
    style: "SPACE IT. LET IT FLY.", description: "Mobile shooters stretch the defense; sharp guard play opens lanes for the roll man.",
    offense: "spacing", defense: "man", tempo: 1.06, ratings: [88, 85, 79, 77, 83],
    names: ["Kieran Moss", "Tariq Blakely", "Ethan Laurent", "Dorian Pierce", "Nolan Ivers", "Amir Coleman", "Victor Marin", "Jace Thornton"],
    source: "https://mgoblue.com/sports/2017/6/16/facilities-crisler-information",
  },
  {
    id: "michigan-state", name: "Michigan State", short: "MSU", mascot: "Spartans", city: "East Lansing, MI",
    primary: "#18453b", secondary: "#ffffff", arena: "Breslin Center",
    style: "OWN THE GLASS.", description: "Strong rebounding and physical defenders create second chances and fast outlet opportunities.",
    offense: "pickroll", defense: "man", tempo: 1.07, ratings: [76, 84, 82, 87, 91],
    names: ["Jaylen Prescott", "Colin Reid", "Makai Dawson", "Wesley Kemp", "Emmanuel Hayes", "Andre Levin", "Bryce Moreno", "Moussa Sane"],
    source: "https://msuspartans.com/facilities/jack-breslin-student-events-center/5",
  },
  {
    id: "syracuse", name: "Syracuse", short: "CUSE", mascot: "Orange", city: "Syracuse, NY",
    primary: "#f76900", secondary: "#000e54", arena: "JMA Wireless Dome",
    style: "MAKE THE LANE DISAPPEAR.", description: "Long defenders and a compact zone challenge interior passes; steady wings handle the scoring.",
    offense: "spacing", defense: "zone", tempo: 0.94, ratings: [84, 79, 76, 92, 83],
    names: ["Simeon Drake", "Dylan Cortez", "Rafael Quinn", "Justice Reed", "Elijah Mbaye", "Tristan Yoon", "Keon Delaney", "Anton Sokolov"],
    source: "https://cuse.com/facilities/jma-wireless-dome/526?Live=8383",
  },
  {
    id: "georgetown", name: "Georgetown", short: "GTWN", mascot: "Hoyas", city: "Washington, DC",
    primary: "#041e42", secondary: "#8d817b", arena: "Capital One Arena",
    style: "THE PAINT IS HOME.", description: "Powerful bigs anchor the post, protect the basket, and punish teams that give up inside position.",
    offense: "post", defense: "zone", tempo: 0.86, ratings: [72, 76, 93, 89, 88],
    names: ["Jared Temple", "Malachi Foster", "Devin Carrington", "Idris Benton", "Nathaniel Okafor", "Luca Bennett", "Sean Alvarez", "Abel Kamara"],
    source: "https://guhoyas.com/sports/2018/6/6/facilities-gu-verizon-center-html.aspx",
  },
  {
    id: "villanova", name: "Villanova", short: "NOVA", mascot: "Wildcats", city: "Villanova, PA",
    primary: "#00205b", secondary: "#13b5ea", arena: "Finneran Pavilion",
    style: "FIND THE OPEN THREE.", description: "A guard-led group with accurate shooters and strong ball control makes every extra pass matter.",
    offense: "spacing", defense: "man", tempo: 0.98, ratings: [94, 82, 73, 85, 78],
    names: ["Gabriel West", "Trevin Kessler", "Marcel Dorsey", "Vincent Osei", "Patrick Rowe", "Camilo Reyes", "Darius Nolan", "Basil Adebayo"],
    source: "https://villanova.com/sports/2024/8/5/finneran-pavilion.aspx",
  },
  {
    id: "gonzaga", name: "Gonzaga", short: "GONZ", mascot: "Bulldogs", city: "Spokane, WA",
    primary: "#041e42", secondary: "#c8102e", arena: "McCarthey Athletic Center",
    style: "FLOW INTO THE NEXT CHANCE.", description: "Skilled finishers and fluid passing keep the offense moving from transition into a high screen.",
    offense: "pickroll", defense: "man", tempo: 1.12, ratings: [87, 85, 88, 74, 81],
    names: ["Oliver Harwood", "Nasir Flynn", "Renzo Vidal", "Lachlan Avery", "Tomas Searle", "Cyrus Dean", "Akil Bennett", "Pavel Romanov"],
    source: "https://gozags.com/facilities/mccarthey-athletic-center/1?path=tickets",
  },
  {
    id: "florida", name: "Florida", short: "FLA", mascot: "Gators", city: "Gainesville, FL",
    primary: "#0021a5", secondary: "#fa4616", arena: "O’Connell Center",
    style: "WIN IT. PUSH IT.", description: "Quick hands and athletic runners make pressure defense an invitation to attack in transition.",
    offense: "motion", defense: "press", tempo: 1.14, ratings: [82, 90, 82, 86, 76],
    names: ["Tyrell Banks", "Luis Caldwell", "Damian Rivers", "Xavier Ellison", "Micah Cisse", "Aiden Salinas", "Kendrick Shaw", "Benicio Moore"],
    source: "https://floridagators.com/sports/2026/7/1/stephen-c-oconnell-center",
  },
  {
    id: "houston", name: "Houston", short: "HOU", mascot: "Cougars", city: "Houston, TX",
    primary: "#c8102e", secondary: "#ffffff", arena: "Fertitta Center",
    style: "EVERY POSSESSION IS EARNED.", description: "Relentless perimeter defense and relentless rebounding create extra possessions for a patient offense.",
    offense: "pickroll", defense: "press", tempo: 0.93, ratings: [75, 81, 78, 95, 91],
    names: ["Marquis Lennox", "Dante Flores", "Khalil Saunders", "Roman Bridges", "Isaiah Danjuma", "Theo Cardenas", "Jeremiah Cooke", "Samir Bell"],
    source: "https://uhcougars.com/news/2026/9/16/mens-basketball-mens-basketball-reveals-2026-27-schedule",
  },
  {
    id: "boston-college", name: "Boston College", short: "BC", mascot: "Eagles", city: "Chestnut Hill, MA",
    primary: "#98002e", secondary: "#bc9b6a", arena: "Conte Forum",
    style: "PLAY SMART. STAY CLOSE.", description: "Patient inside-out play, sturdy rebounders, and dependable free throws make a tight game winnable.",
    offense: "post", defense: "zone", tempo: 0.92, ratings: [84, 76, 85, 82, 87],
    names: ["Adrian Callahan", "Malik Sweeney", "Nico Baptiste", "Desmond Sullivan", "Elias Duarte", "Rory McKenna", "Jordan Afolayan", "Liam Sato"],
    source: "https://bceagles.com/facilities/conte-forum/1",
  },
];

const positions = ["PG", "SG", "SF", "PF", "C", "G", "F", "C"];
const heightBase = [74, 77, 80, 82, 85, 75, 81, 84];
const jerseyNumbers = [1, 3, 12, 24, 32, 5, 21, 44];
const skinTones = ["#7a4630", "#b77950", "#e3ac7c", "#513021", "#d4986b", "#8f5b3b", "#f0c5a1", "#68412d"];
const ratingKeys = ["speed", "shooting", "inside", "passing", "handle", "defense", "rebound", "stamina", "freeThrow"];
const positionalRatings = [
  [86, 78, 68, 88, 89, 76, 56, 84, 80],
  [82, 86, 73, 75, 82, 74, 60, 82, 84],
  [80, 77, 79, 73, 75, 80, 73, 82, 78],
  [71, 62, 87, 68, 66, 84, 87, 80, 70],
  [64, 52, 90, 63, 58, 88, 92, 79, 65],
  [83, 78, 69, 81, 83, 74, 56, 84, 79],
  [75, 72, 81, 70, 70, 81, 80, 82, 73],
  [65, 51, 85, 62, 58, 84, 86, 82, 64],
];

function makePlayer(name, slot, team, teamIndex) {
  const [shooting, speed, inside, defense, rebounding] = team.ratings;
  const biases = [speed - 82, shooting - 82, inside - 82, (shooting - 82) / 2, (speed - 82) / 2, defense - 82, rebounding - 82, team.defense === "press" ? 5 : 0, (shooting - 82) / 2];
  const ratings = Object.fromEntries(ratingKeys.map((key, i) => {
    const individual = ((teamIndex * 11 + slot * 7 + i * 5) % 9) - 4;
    const reserve = slot >= 5 ? 3 : 0;
    return [key, Math.max(50, Math.min(96, Math.round(positionalRatings[slot][i] + biases[i] * 0.8 + individual - reserve)))];
  }));
  return {
    name, number: jerseyNumbers[slot], position: positions[slot],
    height: heightBase[slot] + ((teamIndex + slot) % 3) - 1,
    skin: skinTones[(teamIndex * 3 + slot * 5) % skinTones.length], ratings,
  };
}

export const TEAMS = definitions.map((team, teamIndex) => {
  const { names, source, ...identity } = team;
  return {
    ...identity,
    ratings: Object.fromEntries(["shooting", "speed", "inside", "defense", "rebounding"].map((key, i) => [key, team.ratings[i]])),
    players: names.map((name, slot) => makePlayer(name, slot, team, teamIndex)),
    sources: [{ label: "Official program / venue", url: source }],
  };
});

/** Return a catalogue entry; unknown IDs intentionally fall back to UConn. */
export function getTeam(id) {
  return TEAMS.find((team) => team.id === id) || TEAMS[0];
}
