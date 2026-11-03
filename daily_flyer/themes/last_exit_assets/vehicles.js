// Dimensions are half-width / half-length. Visuals and contacts share these envelopes.
export const VEHICLES={
 sedan:{name:'Regent sedan',w:1.10,l:2.65,mass:1,power:1,maxSpeed:44,cooling:.68},
 coupe:{name:'Marlow coupe',w:1.10,l:2.65,mass:.92,power:1.12,maxSpeed:48,cooling:1.65},
 wagon:{name:'Estate wagon',w:1.10,l:2.65,mass:1.25,power:.92,maxSpeed:39,cooling:.42},
 compact:{name:'Sparrow hatchback',w:.94,l:2.12,mass:.78,power:.95,maxSpeed:41,cooling:1.1},
 pickup:{name:'Braddock pickup',w:1.13,l:2.85,mass:1.35,power:.94,maxSpeed:38,cooling:.5},
 van:{name:'Meridian delivery van',w:1.15,l:2.78,mass:1.5,power:.8,maxSpeed:33,cooling:.65},
 taxi:{name:'Regent city cab',w:1.10,l:2.65,mass:1.05,power:1,maxSpeed:43,cooling:.72}
};
export const vehicleSpec=c=>VEHICLES[c?.kind]||VEHICLES.sedan;
export const TRAFFIC_TYPES=['sedan','compact','taxi','wagon','pickup','coupe','van','sedan','compact','taxi'];
