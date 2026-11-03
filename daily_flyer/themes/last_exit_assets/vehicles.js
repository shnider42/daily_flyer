// Dimensions are half-width / half-length. Visuals and contacts share these envelopes.
export const VEHICLES={
 sedan:{name:'Regent sedan',w:1.10,l:2.65,mass:1,power:1,maxSpeed:38,cooling:.68},
 coupe:{name:'Marlow coupe',w:1.10,l:2.65,mass:.92,power:1.16,maxSpeed:43,cooling:1.65},
 wagon:{name:'Estate wagon',w:1.10,l:2.65,mass:1.25,power:.82,maxSpeed:34,cooling:.42},
 compact:{name:'Sparrow hatchback',w:.94,l:2.12,mass:.78,power:.88,maxSpeed:36,cooling:1.1},
 pickup:{name:'Braddock pickup',w:1.13,l:2.85,mass:1.35,power:.86,maxSpeed:33,cooling:.5},
 van:{name:'Meridian delivery van',w:1.15,l:2.78,mass:1.5,power:.72,maxSpeed:30,cooling:.65},
 sport:{name:'Vela GT',w:1.03,l:2.3,mass:.88,power:1.8,maxSpeed:56,cooling:1.4,rare:true},
 muscle:{name:'Braddock V8',w:1.16,l:2.85,mass:1.3,power:1.55,maxSpeed:50,cooling:1.1,rare:true},
 taxi:{name:'Regent city cab',w:1.10,l:2.65,mass:1.05,power:.94,maxSpeed:37,cooling:.72}
};
export const vehicleSpec=c=>VEHICLES[c?.kind]||VEHICLES.sedan;
export const TRAFFIC_TYPES=['sedan','compact','taxi','wagon','pickup','coupe','van','sedan','compact','taxi'];

// Torque tapers with road speed; common cars take time to build momentum.
export const driveAcceleration=(c,speed)=>4.8*vehicleSpec(c).power/(1+Math.max(0,speed)/18);
